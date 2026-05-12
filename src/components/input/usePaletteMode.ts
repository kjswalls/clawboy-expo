import { useCallback, useEffect, useMemo, useState } from 'react';
import { filterCommands, type SlashCommandItem } from './slashCommands';
import type { PaletteMode } from './SlashCommandPalette';
import type { PickerSection } from './InputBarPickerModal';

interface UsePaletteModeOptions {
  controllerText: string;
  commands: SlashCommandItem[];
  modelSections?: PickerSection[];
}

export interface UsePaletteModeResult {
  paletteMode: PaletteMode | null;
  selectedCommandIndex: number;
  onHighlightCommand: (index: number) => void;
}

export function usePaletteMode({
  controllerText,
  commands,
  modelSections,
}: UsePaletteModeOptions): UsePaletteModeResult {
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1);

  const paletteMode = useMemo((): PaletteMode | null => {
    const text = controllerText;
    const argMatch = text.match(/^\/(\S+)\s(.*)$/u);

    if (argMatch) {
      const cmdName = (argMatch[1] ?? '').toLowerCase();
      const typed = argMatch[2] ?? '';

      if (cmdName === 'model' && modelSections && modelSections.length > 0) {
        const modelCmd = commands.find((c) => c.id === 'model');
        if (modelCmd) {
          const q = typed.trim().toLowerCase();
          const filtered = q
            ? modelSections
                .map((s) => ({
                  ...s,
                  items: s.items.filter(
                    (item) =>
                      item.title.toLowerCase().includes(q) ||
                      (item.subtitle?.toLowerCase().includes(q) ?? false),
                  ),
                }))
                .filter((s) => s.items.length > 0)
            : modelSections;
          if (filtered.length > 0) {
            return {
              kind: 'models',
              command: modelCmd,
              sections: filtered,
              selectedIndex: -1,
              onHighlight: () => {},
              onSelect: () => {},
            };
          }
        }
      }

      const cmd = commands.find((c) => c.name === cmdName);
      if (cmd?.argOptions?.length) {
        const typedLower = typed.toLowerCase();
        const filtered = typedLower
          ? cmd.argOptions.filter((o) => o.toLowerCase().startsWith(typedLower))
          : cmd.argOptions;
        if (filtered.length) {
          return {
            kind: 'args',
            command: cmd,
            options: filtered,
            selectedIndex: -1,
            onHighlight: () => {},
            onSelect: () => {},
          };
        }
      }
    }

    const cmdLooseMatch = text.match(/^\/(\S*)\s*$/u);
    if (cmdLooseMatch) {
      const q = cmdLooseMatch[1] ?? '';
      const items = filterCommands(commands, q, { showPower: q.length > 0 });
      if (items.length) {
        return {
          kind: 'commands',
          commands: items,
          selectedIndex: -1,
          onHighlight: () => {},
          onSelect: () => {},
        };
      }
    }

    return null;
  }, [controllerText, commands, modelSections]);

  const paletteKey = paletteMode?.kind ?? 'none';
  const paletteCount =
    paletteMode?.kind === 'commands'
      ? paletteMode.commands.length
      : paletteMode?.kind === 'args'
        ? paletteMode.options.length
        : paletteMode?.kind === 'models'
          ? paletteMode.sections.reduce((sum, s) => sum + s.items.length, 0)
          : 0;

  useEffect(() => {
    setSelectedCommandIndex(-1);
  }, [paletteKey, paletteCount]);

  const onHighlightCommand = useCallback((index: number): void => {
    setSelectedCommandIndex(index);
  }, []);

  return { paletteMode, selectedCommandIndex, onHighlightCommand };
}
