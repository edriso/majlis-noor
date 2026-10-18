import { Sheet } from '@/components/Sheet';
import { StartPicker } from '@/components/StartPicker';

/** Where to read from instead: a surah, a juz or a page, from which
    whoever has the turn carries on. */
export function JumpSheet({
  open,
  onOpenChange,
  page,
  onGo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: number;
  onGo: (page: number) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="الانتقال إلى"
      description="اختر سورة أو جزءًا أو صفحة، ويُكمل صاحب الدور منها."
    >
      <StartPicker legend="الانتقال حسب" page={page} onChange={onGo} />
      <button
        type="button"
        className="button button-primary button-block"
        onClick={() => onOpenChange(false)}
      >
        اقرأ من هنا
      </button>
    </Sheet>
  );
}
