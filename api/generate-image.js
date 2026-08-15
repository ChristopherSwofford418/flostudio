export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    images: [
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=1024&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=1024&auto=format&fit=crop"
    ],
    status: "success"
  });
}
