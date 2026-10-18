import { ReciterPicker } from '@/components/ReciterPicker';
import { Sheet } from '@/components/Sheet';

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
