/**
 * 全角英数を半角英数に変換
 */
export const toHalfWidth = (str: string): string => {
  return str.replace(/[！-～]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) - 0xfee0);
  }).replace(/ /g, " ");
};

/**
 * 部屋番号の整形（半角化 + 英字大文字化 + 空白除去）
 * 例: " ５０２ａ " -> "502A"
 */
export const sanitizeRoomNumber = (value: string): string => {
  const half = toHalfWidth(value);
  return half.toUpperCase().replace(/\s+/g, "");
};

/**
 * メールアドレスの整形（半角化 + 小文字化 + トリム）
 * 例: " TEST@GMAIL.COM " -> "test@gmail.com"
 */
export const sanitizeEmail = (value: string): string => {
  const half = toHalfWidth(value);
  return half.toLowerCase().trim();
};

/**
 * 氏名（First / Last Name）の整形（重複空白の除去 + トリム）
 */
export const sanitizeName = (value: string): string => {
  return value.trim().replace(/\s+/g, " ");
};