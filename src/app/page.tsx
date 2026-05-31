export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Next.js Template</h1>
      <p className="text-muted-foreground max-w-md text-center text-balance">
        Next.js 16 + TypeScript + Tailwind CSS v4. Configurado con Biome, ESLint, Lefthook,
        Commitlint + Gitmoji, y Dev Containers.
      </p>
      <a
        href="https://nextjs.org/docs"
        className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
        target="_blank"
        rel="noopener noreferrer"
      >
        Next.js Docs →
      </a>
    </main>
  );
}
