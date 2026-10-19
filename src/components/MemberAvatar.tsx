import { User } from './icons';
import { reciterById } from '@/data/reciters';
import type { Member } from '@/halaqa/state';
import { initialOf, tintOf } from './names';
import { ReciterAvatar } from './ReciterAvatar';

/** A member's face in a list: a reciter's photo, a named reader's letter
    (`initialOf`, which looks past «أبو» and «عبد»), or a figure for one not
    named yet, whose default name («القارئ الثاني») would make a misleading
    letter. A reader's frame has their own tint (`tintOf`), the same as in
    the circle, so two whose letters match still differ. Decorative: the
    name is always written beside it. */
export function MemberAvatar({
  member,
  size = 40,
}: {
  member: Member;
  size?: number;
}) {
  if (member.kind === 'reciter')
    return <ReciterAvatar reciter={reciterById(member.reciter)} size={size} />;
  const initial = initialOf(member.name);
  return (
    <span
      className="person-avatar"
      data-tint={tintOf(member)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initial ?? <User size={Math.round(size * 0.46)} strokeWidth={1.8} />}
    </span>
  );
}
