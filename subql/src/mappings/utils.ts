export function decodeRPCResponse(response: any) {
  return JSON.parse(response.result.map((x: number) => String.fromCharCode(x)).join(""))
}

export function fromBase64(base64: string) {
  return JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
}

export function toBase64(obj: any) {
  return Buffer.from(JSON.stringify(obj)).toString(
    "base64"
  );
}
