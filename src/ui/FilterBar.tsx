/**
 * FilterBar — toggle which cards are visible on the canvas across three
 * independent dimensions, one row each: category, topic and type. Every option
 * is selected by default; each row has its own "All" button that selects all /
 * clears that row. Plain click toggles a chip; Cmd/Ctrl-click isolates it.
 */

import { useStore } from '../store';
import { content, itemTypes } from '../content';
import { toTitleCase } from '../lib/text';

/** Human-friendly labels for the (sometimes terse) card type identifiers. */
const TYPE_LABELS: Record<string, string> = {
  normal: 'Normal',
  introduction: 'Introduction',
  conclusion: 'Conclusion',
  imponderable: 'Loose Ends',
  reflection: 'Reflection',
  lookout: 'Lookout',
  abstract: 'Abstract',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? toTitleCase(type);
}

interface FilterRowProps {
  label: string;
  options: readonly string[];
  active: Set<string>;
  labelFor: (value: string) => string;
  onToggle: (value: string) => void;
  onAll: () => void;
  onClear: () => void;
  onOnly: (value: string) => void;
}

function FilterRow({
  label,
  options,
  active,
  labelFor,
  onToggle,
  onAll,
  onClear,
  onOnly,
}: FilterRowProps): React.ReactElement {
  const allSelected = active.size === options.length;
  return (
    <div className="filter__row" role="group" aria-label={`${label} filter`}>
      <span className="filter__label">{label}</span>
      <button
        className={`filter__chip${allSelected ? ' active' : ''}`}
        onClick={() => (allSelected ? onClear() : onAll())}
      >
        All
      </button>
      {options.map((value) => (
        <button
          key={value}
          className={`filter__chip${active.has(value) ? ' active' : ''}`}
          aria-pressed={active.has(value)}
          onClick={(e) => (e.metaKey || e.ctrlKey ? onOnly(value) : onToggle(value))}
        >
          {labelFor(value)}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const activeCategories = useStore((s) => s.activeCategories);
  const toggleCategory = useStore((s) => s.toggleCategory);
  const allCategories = useStore((s) => s.setAllCategories);
  const clearCategories = useStore((s) => s.clearCategories);
  const onlyCategory = useStore((s) => s.setOnlyCategory);

  const activeTopics = useStore((s) => s.activeTopics);
  const toggleTopic = useStore((s) => s.toggleTopic);
  const allTopics = useStore((s) => s.setAllTopics);
  const clearTopics = useStore((s) => s.clearTopics);
  const onlyTopic = useStore((s) => s.setOnlyTopic);

  const activeTypes = useStore((s) => s.activeTypes);
  const toggleType = useStore((s) => s.toggleType);
  const allTypes = useStore((s) => s.setAllTypes);
  const clearTypes = useStore((s) => s.clearTypes);
  const onlyType = useStore((s) => s.setOnlyType);

  return (
    <div
      className={`filter${embedded ? ' filter--embedded' : ' chrome no-print'}`}
      role="group"
      aria-label="Filters"
    >
      <FilterRow
        label="Category"
        options={content.categories}
        active={activeCategories}
        labelFor={toTitleCase}
        onToggle={toggleCategory}
        onAll={allCategories}
        onClear={clearCategories}
        onOnly={onlyCategory}
      />
      {content.topics.length > 0 && (
        <FilterRow
          label="Topic"
          options={content.topics}
          active={activeTopics}
          labelFor={toTitleCase}
          onToggle={toggleTopic}
          onAll={allTopics}
          onClear={clearTopics}
          onOnly={onlyTopic}
        />
      )}
      <FilterRow
        label="Type"
        options={itemTypes}
        active={activeTypes}
        labelFor={typeLabel}
        onToggle={toggleType}
        onAll={allTypes}
        onClear={clearTypes}
        onOnly={onlyType}
      />
    </div>
  );
}
