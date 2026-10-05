import { BookOpen, BriefcaseBusiness, Film, Folder, Palette } from 'lucide-react';
export function BoardIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon =
    (
      { palette: Palette, film: Film, briefcase: BriefcaseBusiness, book: BookOpen } as Record<
        string,
        typeof Folder
      >
    )[name] ?? Folder;
  return <Icon size={size} aria-hidden="true" />;
}
