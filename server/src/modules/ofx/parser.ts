import { XMLParser } from "fast-xml-parser";

export interface RawOfxTransaction {
  fitId: string;
  date: Date;
  amount: number;
  type: string;
  description: string;
  payee?: string;
  memo?: string;
  checkNumber?: string;
}

export interface RawOfxStatement {
  bankAccountId: string;
  currency: string;
  statementStart: Date | null;
  statementEnd: Date | null;
  transactions: RawOfxTransaction[];
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Decodifica o buffer respeitando o CHARSET declarado no cabeçalho OFX (comum vir em Windows-1252 em bancos BR). */
function decodeOfxBuffer(buffer: Buffer): string {
  const preview = buffer.subarray(0, 1024).toString("latin1");
  const usesLatin1 = /CHARSET:\s*(1252|8859-1)/i.test(preview);
  return buffer.toString(usesLatin1 ? "latin1" : "utf-8");
}

/** Converte o corpo SGML do OFX 1.x (tags de dado sem fechamento) para XML bem formado. */
function sgmlToXml(body: string): string {
  return body.replace(/<([A-Za-z0-9._]+)>([^<\r\n]*)/g, (_match, tag: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return `<${tag}>${escapeXml(trimmed)}</${tag}>`;
    }
    return `<${tag}>`;
  });
}

function parseOfxDate(raw?: string | number): Date | null {
  if (raw === undefined || raw === null) return null;
  const digits = String(raw).slice(0, 8);
  if (!/^\d{8}$/.test(digits)) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmount(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().replace(",", ".");
  const amount = Number(normalized);
  return Number.isNaN(amount) ? null : amount;
}

function parseTransaction(node: Record<string, unknown>): RawOfxTransaction | null {
  const amount = parseAmount(node.TRNAMT as string | number | undefined);
  const date = parseOfxDate(node.DTPOSTED as string | undefined);
  if (amount === null || !date) return null;

  const name = node.NAME as string | undefined;
  const payee = node.PAYEE as string | undefined;
  const memo = node.MEMO as string | undefined;
  const fitId = (node.FITID as string | undefined) ?? `${node.DTPOSTED}-${node.TRNAMT}-${name ?? memo ?? ""}`;

  return {
    fitId: String(fitId),
    date,
    amount,
    type: String(node.TRNTYPE ?? (amount >= 0 ? "CREDIT" : "DEBIT")),
    description: String(name ?? payee ?? memo ?? "Transação"),
    payee: payee ? String(payee) : undefined,
    memo: memo ? String(memo) : undefined,
    checkNumber: node.CHECKNUM ? String(node.CHECKNUM) : undefined,
  };
}

function parseStatement(stmt: Record<string, any>, kind: "BANK" | "CC"): RawOfxStatement {
  const acct = kind === "BANK" ? stmt.BANKACCTFROM : stmt.CCACCTFROM;
  const tranList = stmt.BANKTRANLIST ?? {};
  const transactions = asArray(tranList.STMTTRN)
    .map(parseTransaction)
    .filter((tx): tx is RawOfxTransaction => tx !== null);

  return {
    bankAccountId: String(acct?.ACCTID ?? ""),
    currency: String(stmt.CURDEF ?? "BRL"),
    statementStart: parseOfxDate(tranList.DTSTART),
    statementEnd: parseOfxDate(tranList.DTEND),
    transactions,
  };
}

export function parseOfx(buffer: Buffer): RawOfxStatement[] {
  const raw = decodeOfxBuffer(buffer);
  const withoutPIs = raw.replace(/<\?[^>]*\?>/g, "");

  const ofxTagIndex = withoutPIs.search(/<OFX>/i);
  if (ofxTagIndex === -1) {
    throw new Error("Arquivo OFX inválido: tag <OFX> não encontrada");
  }

  const header = withoutPIs.slice(0, ofxTagIndex);
  const body = withoutPIs.slice(ofxTagIndex);
  const isSgml = !/^\s*<\?xml/i.test(raw) && !/DATA:\s*OFXXML/i.test(header);
  const xml = isSgml ? sgmlToXml(body) : body;

  const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
  const parsed = parser.parse(xml) as Record<string, any>;
  const ofx = parsed.OFX;
  if (!ofx) {
    throw new Error("Arquivo OFX inválido: estrutura raiz <OFX> ausente após o parse");
  }

  const statements: RawOfxStatement[] = [];

  const bankMsgs = ofx.BANKMSGSRSV1;
  for (const trnrs of asArray(bankMsgs?.STMTTRNRS)) {
    if (trnrs?.STMTRS) statements.push(parseStatement(trnrs.STMTRS, "BANK"));
  }

  const ccMsgs = ofx.CREDITCARDMSGSRSV1;
  for (const trnrs of asArray(ccMsgs?.CCSTMTTRNRS)) {
    if (trnrs?.CCSTMTRS) statements.push(parseStatement(trnrs.CCSTMTRS, "CC"));
  }

  if (statements.length === 0) {
    throw new Error("Nenhuma transação encontrada no arquivo OFX");
  }

  return statements;
}
