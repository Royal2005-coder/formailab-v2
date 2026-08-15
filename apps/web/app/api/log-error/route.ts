export async function POST(req: Request) {
  const body = await req.text();
  console.log("REACT CLIENT ERROR:", body);
  return new Response("Logged");
}
