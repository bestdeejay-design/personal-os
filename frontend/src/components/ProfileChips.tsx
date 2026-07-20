import type { Profile } from "../types";

export function ProfileBadge({ color, name }: { color: string; name: string }): JSX.Element {
  return (
    <span className="badge" style={{ background: "transparent", color }}>
      <span className="swatch" style={{ background: color }} />
      {name}
    </span>
  );
}

export function ProfileChips({
  profiles,
  selected,
  onToggle,
}: {
  profiles: Profile[];
  selected: string[];
  onToggle: (id: string) => void;
}): JSX.Element {
  return (
    <div className="chips-row">
      {profiles.map((p) => {
        const active = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            className={"chip" + (active ? " active" : "")}
            style={{ ["--chip-color" as string]: p.color }}
            onClick={() => onToggle(p.id)}
            aria-pressed={active}
          >
            <span className="swatch" style={{ background: p.color }} />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
