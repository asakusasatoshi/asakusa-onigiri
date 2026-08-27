export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f5f5f4] text-stone-800 font-sans">
      {children}
    </div>
  );
}