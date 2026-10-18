import { PlacePicker } from '@/components/PlacePicker';
import { Sheet } from '@/components/Sheet';

/** Where to read from instead: a surah, a juz or a page, from which
    whoever has the turn carries on. Choosing goes there at once, to the
    ayah chosen (a surah's first, a juz's true start, a page's top), and
    closes. A short panel: a box in the middle of a wide screen. */
export function JumpSheet({
  open,
  onOpenChange,
  ayah,
  page,
  onGo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the circle is: the first ayah not yet left behind, and the
      page open. */
  ayah: number;
  page: number;
  onGo: (ayah: number) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="الانتقال إلى"
      description="اختر سورة أو جزءًا أو صفحة، ويُكمل صاحب الدور منها."
      variant="dialog"
    >
      <PlacePicker
        current={{ ayah, page }}
        onChoose={(place) => {
          onGo(place.ayah);
          onOpenChange(false);
        }}
      />
    </Sheet>
  );
}
