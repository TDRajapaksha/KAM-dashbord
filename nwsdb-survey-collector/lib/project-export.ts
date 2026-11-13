import type { Project, Question, ResponseRow } from "@/lib/api";
import { buildProjectXml } from "@/lib/api";

export type ProjectExportFormat = "docx" | "xlsx" | "xml";

function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "project";
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatAnswer(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export async function downloadProjectExport(
  format: ProjectExportFormat,
  project: Project,
  questions: Question[],
  responses: ResponseRow[]
): Promise<void> {
  const baseName = safeFileName(project.name);

  if (format === "xml") {
    downloadBlob(
      new Blob([buildProjectXml(project, questions, responses)], {
        type: "application/xml;charset=utf-8",
      }),
      `${baseName}.xml`
    );
    return;
  }

  if (format === "docx") {
    const { Document, HeadingLevel, Packer, Paragraph } = await import("docx");
    const content = [
      new Paragraph({ text: project.name, heading: HeadingLevel.TITLE }),
      new Paragraph(`Description: ${project.description || "—"}`),
      new Paragraph(`Sector: ${project.sector || "—"}`),
      new Paragraph(`Country: ${project.country || "—"}`),
      new Paragraph(`Status: ${project.status}`),
      new Paragraph({ text: "Questions", heading: HeadingLevel.HEADING_1 }),
    ];

    questions.forEach((question, index) => {
      content.push(
        new Paragraph({
          text: `${index + 1}. ${question.label} (${question.type})`,
        })
      );
      if (Array.isArray(question.choices) && question.choices.length > 0) {
        content.push(new Paragraph(`Choices: ${question.choices.join(", ")}`));
      }
    });

    content.push(
      new Paragraph({ text: "Responses", heading: HeadingLevel.HEADING_1 })
    );
    if (responses.length === 0) {
      content.push(new Paragraph("No responses."));
    } else {
      responses.forEach((response, index) => {
        content.push(
          new Paragraph({
            text: `Submission ${index + 1}: ${response.submitter_name ?? "Anonymous"}`,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph(
            `Submitted at: ${new Date(response.submitted_at).toLocaleString()}`
          )
        );
        questions.forEach((question) => {
          content.push(
            new Paragraph(
              `${question.label}: ${formatAnswer(response.answers?.[question.id])}`
            )
          );
        });
      });
    }

    const document = new Document({
      sections: [{ properties: {}, children: content }],
    });
    downloadBlob(await Packer.toBlob(document), `${baseName}.docx`);
    return;
  }

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KAM Collector";

  const responseSheet = workbook.addWorksheet("Responses");
  responseSheet.addRow([
    "#",
    "Submitted by",
    "Email",
    "Submitted at",
    ...questions.map((question, index) => `${index + 1}. ${question.label}`),
  ]);
  responses.forEach((response, index) => {
    responseSheet.addRow([
      index + 1,
      response.submitter_name ?? "Anonymous",
      response.submitter_email ?? "",
      response.submitted_at,
      ...questions.map((question) =>
        formatAnswer(response.answers?.[question.id])
      ),
    ]);
  });

  responseSheet.getRow(1).font = { bold: true };
  responseSheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([new Uint8Array(buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${safeFileName(`${project.name}_${project.sector || "Unspecified"}`)}.xlsx`
  );
}
