interface Props {
  title: string;
  action?: React.ReactNode;
}

export default function SectionHeader({ title, action }: Props) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-ink-secondary">{title}</h2>
      {action}
    </div>
  );
}

