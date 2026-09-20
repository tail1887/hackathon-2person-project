type AvatarProps = {
  displayName: string;
  size?: "sm" | "lg";
};

const colors = ["bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500"];

function colorIndex(value: string) {
  return [...value].reduce((sum, character) => sum + character.codePointAt(0)!, 0) % colors.length;
}

export function Avatar({ displayName, size = "sm" }: AvatarProps) {
  const initial = displayName.trim().slice(0, 1) || "?";
  const dimensions = size === "lg" ? "h-20 w-20 text-3xl" : "h-10 w-10 text-base";

  return (
    <span
      aria-label={`${displayName}의 기본 아바타`}
      className={`inline-flex ${dimensions} items-center justify-center rounded-full font-semibold text-white ${colors[colorIndex(displayName)]}`}
    >
      {initial}
    </span>
  );
}
