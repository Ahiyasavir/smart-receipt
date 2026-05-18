import { cn } from '../../lib/cn';

interface Props {
  variant?: 'full' | 'icon';
  className?: string;
}

export default function Logo({ variant = 'full', className }: Props) {
  if (variant === 'icon') {
    return (
      <img
        src="/brand/spendora-logo.png"
        alt="Spendora"
        className={cn('h-8 w-8 object-cover object-left', className)}
        style={{ objectPosition: 'left center' }}
      />
    );
  }

  return (
    <img
      src="/brand/spendora-logo.png"
      alt="Spendora"
      className={cn('h-7 w-auto object-contain', className)}
    />
  );
}

