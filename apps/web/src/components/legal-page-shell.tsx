import Link from 'next/link';

interface LegalPageShellProps {
  title: string;
  updatedAt?: string;
  children: React.ReactNode;
}

export function LegalPageShell({ title, updatedAt, children }: LegalPageShellProps) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Início
        </Link>
        <span>/</span>
        <span className="text-foreground">{title}</span>
      </nav>

      <h1 className="mb-2 text-3xl font-bold">{title}</h1>
      {updatedAt && (
        <p className="mb-8 text-sm text-muted-foreground">
          Última atualização:{' '}
          {new Date(updatedAt).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}

      <div
        className="
          space-y-0 text-sm leading-relaxed text-foreground
          [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:first:mt-0
          [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold
          [&_p]:mb-4 [&_p]:leading-relaxed
          [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6
          [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6
          [&_li]:mb-1
          [&_strong]:font-semibold
          [&_em]:italic [&_em]:text-muted-foreground
          [&_a]:text-primary [&_a]:underline [&_a]:hover:no-underline
        "
      >
        {children}
      </div>
    </main>
  );
}
