import { CoverGrid, GridBook } from "@/components/cover";
import { ShelvesProvider } from "@/components/quick-actions";
import { orNotFound, serverApi } from "@/server/api";

export default async function ReadingListPage(props: PageProps<"/[username]/reading-list">) {
  const { username } = await props.params;
  const api = await serverApi();
  const [books, me] = await Promise.all([
    orNotFound(api.users.readingList({ username })),
    api.users.me(),
  ]);
  const grid = (
    <CoverGrid min={100}>
      {books.map((b) => (
        <GridBook key={b.id} book={b} actions={!!me} />
      ))}
    </CoverGrid>
  );
  return (
    <div>
      <p className="mb-4 text-xs uppercase tracking-wider text-muted">
        {books.length.toLocaleString()} {books.length === 1 ? "book" : "books"} to read
      </p>
      {me ? <ShelvesProvider workIds={books.map((b) => b.id)}>{grid}</ShelvesProvider> : grid}
    </div>
  );
}
