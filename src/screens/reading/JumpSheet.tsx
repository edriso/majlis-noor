import { ReciterPicker } from '@/components/ReciterPicker';
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

/** The sheikhs, opened from «استمع» when the one it uses cannot recite
    what is open: choosing one makes him the halaqa's own, who is heard
    through «استمع» and, if turns are timed, times them. */
export function ListenerSheet({
  open,
  onOpenChange,
  reciter,
  timed,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reciter: string;
  timed: boolean;
  onChoose: (reciter: string) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="شيخ الاستماع"
      description={
        timed
          ? 'شيخ يُستمع إليه في الصفحة، وتُقاس بتلاوته مدة الدور.'
          : 'شيخ يُستمع إليه في الصفحة.'
      }
    >
      <ReciterPicker
        value={reciter}
        onChange={(id) => {
          onChoose(id);
          onOpenChange(false);
        }}
      />
    </Sheet>
  );
}
