import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-serif text-3xl">Page not found</h1>
      <p className="mt-2 text-muted">This page has been lost, like a library book.</p>
      <Link href="/" className="mt-6 inline-block text-read underline">
        Back to books
      </Link>
    </div>
  );
}
