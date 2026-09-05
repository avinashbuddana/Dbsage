export interface CsvPreview {
  headers: string[];
  sampleRow: string[];
}

const PREVIEW_BYTES = 65_536;

function readAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(new Error('Could not read the file'));
    };
    reader.readAsText(blob);
  });
}

export async function previewCsv(file: File, delimiter = ','): Promise<CsvPreview> {
  const text = await readAsText(file.slice(0, PREVIEW_BYTES));
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
  const headerLine = lines[0];
  const sampleLine = lines[1];
  return {
    headers: headerLine ? splitCsvLine(headerLine, delimiter) : [],
    sampleRow: sampleLine ? splitCsvLine(sampleLine, delimiter) : [],
  };
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char ?? '';
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char ?? '';
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}
