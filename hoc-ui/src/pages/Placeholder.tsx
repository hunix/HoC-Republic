import { PageHeader, EmptyState, Card } from "@/components/ui";

interface PlaceholderPageProps {
  title: string;
  icon: string;
}

export function PlaceholderPage({ title, icon }: PlaceholderPageProps) {
  return (
    <div className="animate-slide-up">
      <PageHeader title={title} icon={<span className="text-2xl">{icon}</span>} />
      <Card>
        <EmptyState
          icon={<span className="text-5xl">{icon}</span>}
          title={`${title} — Coming Soon`}
          description="This page is being built with React + Tailwind. Check back shortly."
        />
      </Card>
    </div>
  );
}
