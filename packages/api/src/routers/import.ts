import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { startImportSchema, importClientRowSchema, importServiceRowSchema } from "@bookai/validators";

export const importRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.importJob.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }),

  getStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.importJob.findFirstOrThrow({
        where: { id: input.id, organizationId: ctx.organizationId },
      });
    }),

  createJob: protectedProcedure
    .input(
      z.object({
        type: z.enum(["CLIENTS", "SERVICES", "APPOINTMENTS"]),
        fileName: z.string(),
        totalRows: z.number().int().min(0),
        columnHeaders: z.array(z.string()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.importJob.create({
        data: {
          organizationId: ctx.organizationId,
          type: input.type,
          fileName: input.fileName,
          totalRows: input.totalRows,
          mappings: { headers: input.columnHeaders },
        },
      });
      return job;
    }),

  startImport: protectedProcedure
    .input(startImportSchema)
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.importJob.findFirstOrThrow({
        where: { id: input.importJobId, organizationId: ctx.organizationId },
      });

      if (job.status !== "PENDING") {
        throw new Error("Import job is not in PENDING status");
      }

      await ctx.prisma.importJob.update({
        where: { id: job.id },
        data: { mappings: input.mappings, status: "PROCESSING" },
      });

      return { success: true, jobId: job.id };
    }),

  processClientBatch: protectedProcedure
    .input(
      z.object({
        importJobId: z.string(),
        rows: z.array(z.record(z.string(), z.string())),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.importJob.findFirstOrThrow({
        where: { id: input.importJobId, organizationId: ctx.organizationId },
      });

      if (job.status !== "PROCESSING") {
        throw new Error("Import job is not processing");
      }

      const mappings = (job.mappings as Record<string, string>) ?? {};
      const errors: Array<{ row: number; field: string; message: string }> = [];
      const existingErrors = (Array.isArray(job.errors) ? job.errors : []) as Array<{ row: number; field: string; message: string }>;
      let processedCount = 0;

      for (let i = 0; i < input.rows.length; i++) {
        const rawRow = input.rows[i];
        const rowIndex = job.processedRows + i + 1;

        const mapped: Record<string, string> = {};
        for (const [csvCol, dbField] of Object.entries(mappings)) {
          if (rawRow[csvCol] !== undefined && rawRow[csvCol] !== "") {
            mapped[dbField] = rawRow[csvCol];
          }
        }

        if (mapped.tags) {
          try {
            (mapped as any).tags = mapped.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
          } catch {
            (mapped as any).tags = [];
          }
        }

        const parsed = importClientRowSchema.safeParse(mapped);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            errors.push({
              row: rowIndex,
              field: issue.path.join("."),
              message: issue.message,
            });
          }
          continue;
        }

        try {
          // Upsert: match on email or phone within org
          const matchConditions: Array<Record<string, unknown>> = [];
          if (parsed.data.email) {
            matchConditions.push({
              organizationId: ctx.organizationId,
              email: parsed.data.email,
            });
          }
          if (parsed.data.phone) {
            matchConditions.push({
              organizationId: ctx.organizationId,
              phone: parsed.data.phone,
            });
          }

          let existingClient = null;
          if (matchConditions.length > 0) {
            existingClient = await ctx.prisma.client.findFirst({
              where: {
                OR: matchConditions,
              },
            });
          }

          if (existingClient) {
            await ctx.prisma.client.update({
              where: { id: existingClient.id },
              data: {
                firstName: parsed.data.firstName,
                ...(parsed.data.lastName && { lastName: parsed.data.lastName }),
                ...(parsed.data.email && { email: parsed.data.email }),
                ...(parsed.data.phone && { phone: parsed.data.phone }),
                ...(parsed.data.preferredChannel && { preferredChannel: parsed.data.preferredChannel }),
                ...(parsed.data.tags && { tags: parsed.data.tags }),
                ...(parsed.data.notes && { notes: parsed.data.notes }),
                source: "IMPORT",
              },
            });
          } else {
            await ctx.prisma.client.create({
              data: {
                organizationId: ctx.organizationId,
                firstName: parsed.data.firstName,
                lastName: parsed.data.lastName,
                email: parsed.data.email,
                phone: parsed.data.phone,
                preferredChannel: parsed.data.preferredChannel ?? "EMAIL",
                tags: parsed.data.tags ?? [],
                notes: parsed.data.notes,
                source: "IMPORT",
              },
            });
          }

          processedCount++;
        } catch (err) {
          errors.push({
            row: rowIndex,
            field: "_db",
            message: err instanceof Error ? err.message : "Database error",
          });
        }
      }

      const allErrors = [...existingErrors, ...errors];
      await ctx.prisma.importJob.update({
        where: { id: job.id },
        data: {
          processedRows: { increment: processedCount },
          errorRows: { increment: errors.length },
          errors: allErrors,
        },
      });

      return {
        processed: processedCount,
        errors: errors.length,
        totalProcessed: job.processedRows + processedCount,
      };
    }),

  processServiceBatch: protectedProcedure
    .input(
      z.object({
        importJobId: z.string(),
        rows: z.array(z.record(z.string(), z.string())),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.importJob.findFirstOrThrow({
        where: { id: input.importJobId, organizationId: ctx.organizationId },
      });

      if (job.status !== "PROCESSING") {
        throw new Error("Import job is not processing");
      }

      const mappings = (job.mappings as Record<string, string>) ?? {};
      const errors: Array<{ row: number; field: string; message: string }> = [];
      const existingErrors = (Array.isArray(job.errors) ? job.errors : []) as Array<{ row: number; field: string; message: string }>;
      let processedCount = 0;

      const serviceCount = await ctx.prisma.service.count({
        where: { organizationId: ctx.organizationId },
      });

      for (let i = 0; i < input.rows.length; i++) {
        const rawRow = input.rows[i];
        const rowIndex = job.processedRows + i + 1;

        const mapped: Record<string, string> = {};
        for (const [csvCol, dbField] of Object.entries(mappings)) {
          if (rawRow[csvCol] !== undefined && rawRow[csvCol] !== "") {
            mapped[dbField] = rawRow[csvCol];
          }
        }

        const parsed = importServiceRowSchema.safeParse(mapped);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            errors.push({
              row: rowIndex,
              field: issue.path.join("."),
              message: issue.message,
            });
          }
          continue;
        }

        try {
          await ctx.prisma.service.create({
            data: {
              organizationId: ctx.organizationId,
              name: parsed.data.name,
              description: parsed.data.description,
              category: parsed.data.category,
              durationMinutes: parsed.data.durationMinutes,
              bufferMinutes: parsed.data.bufferMinutes ?? 0,
              price: parsed.data.price,
              sortOrder: serviceCount + processedCount,
            },
          });
          processedCount++;
        } catch (err) {
          errors.push({
            row: rowIndex,
            field: "_db",
            message: err instanceof Error ? err.message : "Database error",
          });
        }
      }

      const allErrors = [...existingErrors, ...errors];
      await ctx.prisma.importJob.update({
        where: { id: job.id },
        data: {
          processedRows: { increment: processedCount },
          errorRows: { increment: errors.length },
          errors: allErrors,
        },
      });

      return {
        processed: processedCount,
        errors: errors.length,
        totalProcessed: job.processedRows + processedCount,
      };
    }),

  completeJob: protectedProcedure
    .input(z.object({ importJobId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.prisma.importJob.findFirstOrThrow({
        where: { id: input.importJobId, organizationId: ctx.organizationId },
      });

      await ctx.prisma.importJob.update({
        where: { id: job.id },
        data: {
          status: job.errorRows > 0 && job.processedRows === 0 ? "FAILED" : "COMPLETED",
        },
      });

      return { success: true };
    }),
});
