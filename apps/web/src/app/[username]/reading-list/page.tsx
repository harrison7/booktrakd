import { BookCover, CoverGrid } from "@/components/cover";
import { orNotFound, serverApi } from "@/server/api";

export default async function ReadingListPage(props: PageProps<"/[username]/reading-list">) {
  const { username } = await props.params;
  const books = await orNotFound((await serverApi()).users.readingList({ username }));
  return (
    <div>
      <p className="mb-4 text-xs uppercase tracking-wider text-muted">
        {books.length.toLocaleString()} {books.length === 1 ? "book" : "books"} to read
      </p>
      <CoverGrid min={100}>
        {books.map((b) => (
          <BookCover key={b.id} book={b} size="md" fluid />
        ))}
      </CoverGrid>
    </div>
  );
}
