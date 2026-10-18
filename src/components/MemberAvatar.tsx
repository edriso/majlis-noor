import { User } from './icons';
import { reciterById } from '@/data/reciters';
import type { Member } from '@/halaqa/state';
import { ReciterAvatar } from './ReciterAvatar';

/** A member's face in a list: a reciter's photo, a named reader's first
    letter, or a figure for one not named yet, whose default name («القارئ
    الثاني») would make a misleading letter. Decorative: the name is always
    written beside it. */
export function MemberAvatar({
  member,
  size = 40,
}: {
  member: Member;
  size?: number;
}) {
  if (member.kind === 'reciter')
    return <ReciterAvatar reciter={reciterById(member.reciter)} size={size} />;
  const initial = member.name.trim().at(0);
  return (
    <span
      className="person-avatar"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initial ?? <User size={Math.round(size * 0.46)} strokeWidth={1.8} />}
    </span>
  );
}
