export const runtime = "nodejs";

export async function GET(request: Request) {
  return Response.redirect(new URL("/transferencia-ingresso/cancelada?legado=1", request.url), 303);
}
