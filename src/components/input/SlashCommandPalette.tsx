import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Terminal } from 'lucide-react-native';
import type { TFunction } from 'i18next';
import i18n from 'i18next';
import { useTranslation } from 'react-i18next';

import { useThemeContext } from '@/contexts/ThemeContext';
import { BorderRadius, FontSize, Spacing } from '@/constants/theme';
import { ProviderIcon } from '@/components/common/ProviderIcon';
import { formatCtxWindow } from '@/lib/formatTokens';

import {
  type SlashCommandCategory,
  type SlashCommandItem,
} from './slashCommands';
import type { PickerItem, PickerSection } from './InputBarPickerModal';

// ── Mode types ───────────────────────────────────────────────────────────────

type CommandsMode = {
  kind: 'commands';
  commands: SlashCommandItem[];
  /** Highlighted row index. -1 = nothing selected. */
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (cmd: SlashCommandItem) => void;
};

type ArgsMode = {
  kind: 'args';
  command: SlashCommandItem;
  options: string[];
  /** Highlighted row index. -1 = nothing selected. */
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (option: string) => void;
};

type ModelsMode = {
  kind: 'models';
  command: SlashCommandItem;
  sections: PickerSection[];
  /** Highlighted flat row index across all sections. -1 = nothing selected. */
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (item: PickerItem) => void;
};

export type PaletteMode = CommandsMode | ArgsMode | ModelsMode;

interface SlashCommandPaletteProps {
  /** Whether the palette should be visible. The component stays mounted either way. */
  visible: boolean;
  mode: PaletteMode;
}

type PaletteRow =
  | { kind: 'header'; category: SlashCommandCategory }
  | { kind: 'command'; command: SlashCommandItem; flatIndex: number };

type ThemeColors = ReturnType<typeof useThemeContext>['colors'];

/**
 * Look up a localized description for any slash command — built-in or remote.
 * The command name is normalized (`:`, `.`, `-` → `_`) to avoid i18next treating
 * colons as namespace separators. The gateway-provided English description is
 * always the defaultValue fallback, so untranslated remote commands still render.
 */
function translatedSlashDescription(t: TFunction, cmd: SlashCommandItem): string {
  const key = cmd.name.replace(/[:.-]/gu, '_');
  const fullKey = `input.slashCommands.${key}.description`;
  // i18next's missingKeyHandler fires for any key absent from the bundle even
  // when defaultValue is supplied — and remote (gateway-installed) commands by
  // definition have names we can't predict. Only call t() when the key is
  // actually present, otherwise fall through to the gateway-provided description.
  return i18n.exists(fullKey) ? t(fullKey) : cmd.description;
}

// ── Badge ────────────────────────────────────────────────────────────────────

function Badge({ label, primaryColor }: { label: string; primaryColor: string }): React.JSX.Element {
  return (
    <View style={[badgeStyles.pill, { backgroundColor: primaryColor + '1F' }]}>
      <Text style={[badgeStyles.label, { color: primaryColor }]}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});

// ── Detail footer ─────────────────────────────────────────────────────────────

function PaletteDetailFooter({
  mode,
  selectedCommand,
  selectedOption,
  selectedModel,
  borderColor,
  textColor,
  mutedColor,
}: {
  mode: PaletteMode['kind'];
  selectedCommand: SlashCommandItem | null;
  selectedOption?: string;
  selectedModel?: PickerItem;
  borderColor: string;
  textColor: string;
  mutedColor: string;
}): React.JSX.Element {
  const { t } = useTranslation();

  if (mode === 'models') {
    if (!selectedModel) {
      return (
        <View style={[footerStyles.row, { borderTopColor: borderColor }]}>
          <Text style={[footerStyles.hint, { color: mutedColor }]}>{t('input.palette.tapAModel')}</Text>
        </View>
      );
    }
    const parts: string[] = [];
    if (selectedModel.subtitle) parts.push(selectedModel.subtitle);
    if (selectedModel.contextWindow) parts.push(formatCtxWindow(selectedModel.contextWindow));
    if (selectedModel.reasoning) parts.push(t('input.palette.reasoning'));
    return (
      <View style={[footerStyles.row, { borderTopColor: borderColor }]}>
        <Text style={[footerStyles.name, { color: textColor }]} numberOfLines={1}>
          {selectedModel.title}
        </Text>
        {parts.length > 0 ? (
          <Text style={[footerStyles.desc, { color: mutedColor }]} numberOfLines={1}>
            {parts.join(' · ')}
          </Text>
        ) : null}
      </View>
    );
  }

  if (mode === 'args') {
    if (!selectedCommand) {
      return (
        <View style={[footerStyles.row, { borderTopColor: borderColor }]}>
          <Text style={[footerStyles.hint, { color: mutedColor }]}>{t('input.palette.tapAnOption')}</Text>
        </View>
      );
    }
    const full = selectedOption
      ? `/${selectedCommand.name} ${selectedOption}`
      : `/${selectedCommand.name} …`;
    const cmdDesc = translatedSlashDescription(t, selectedCommand);
    return (
      <View style={[footerStyles.row, { borderTopColor: borderColor }]}>
        <Text style={[footerStyles.name, { color: textColor }]} numberOfLines={1}>{full}</Text>
        {!selectedOption ? (
          <Text style={[footerStyles.desc, { color: mutedColor }]} numberOfLines={1}>
            {cmdDesc}
          </Text>
        ) : null}
      </View>
    );
  }

  // commands mode
  if (!selectedCommand) {
    return (
      <View style={[footerStyles.row, { borderTopColor: borderColor }]}>
        <Text style={[footerStyles.hint, { color: mutedColor }]}>{t('input.palette.tapToRun')}</Text>
      </View>
    );
  }

  const argHint = selectedCommand.args ? ` ${selectedCommand.args}` : '';
  const isInstant = Boolean(selectedCommand.executeLocal && !selectedCommand.argOptions?.length);
  const optionsStr = selectedCommand.argOptions?.length
    ? `  ·  ${selectedCommand.argOptions.join(', ')}`
    : '';
  const cmdDesc = translatedSlashDescription(t, selectedCommand);
  return (
    <View style={[footerStyles.row, { borderTopColor: borderColor }]}>
      <Text style={[footerStyles.name, { color: textColor }]} numberOfLines={1}>
        /{selectedCommand.name}{argHint}{isInstant ? `  ·  ${t('input.palette.instant')}` : ''}
      </Text>
      <Text style={[footerStyles.desc, { color: mutedColor }]} numberOfLines={1}>
        {cmdDesc}{optionsStr}
      </Text>
    </View>
  );
}

const footerStyles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  name: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  desc: {
    fontSize: FontSize.xs,
  },
  hint: {
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
});

// ── CommandRow ────────────────────────────────────────────────────────────────

interface CommandRowProps {
  command: SlashCommandItem;
  flatIndex: number;
  selected: boolean;
  onHighlight: (index: number) => void;
  onSelect: (cmd: SlashCommandItem) => void;
  colors: ThemeColors;
}

const CommandRow = React.memo(function CommandRow({
  command,
  flatIndex,
  selected,
  onHighlight,
  onSelect,
  colors,
}: CommandRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = command.icon;
  const isInstant = Boolean(command.executeLocal && !command.argOptions?.length);
  const hasOptions = (command.argOptions?.length ?? 0) > 0;
  const description = translatedSlashDescription(t, command);

  return (
    <Pressable
      onPress={() => onSelect(command)}
      onLongPress={() => onHighlight(flatIndex)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? colors.primary + '1F'
            : pressed
              ? colors.secondary
              : 'transparent',
        },
      ]}
    >
      <Icon
        size={14}
        color={colors.primary}
        style={{ opacity: selected ? 1 : 0.7 }}
      />
      <View style={styles.textCol}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: selected ? colors.foreground : colors.primary }]}>
            /{command.name}
          </Text>
          {command.args ? (
            <Text style={[styles.argHint, { color: colors.mutedForeground }]}>
              {' '}{command.args}
            </Text>
          ) : null}
        </View>
      </View>
      <Text
        style={[styles.desc, { color: selected ? colors.foreground : colors.mutedForeground }]}
        numberOfLines={1}
      >
        {description}
      </Text>
      {isInstant ? (
        <Badge label={t('input.palette.instant')} primaryColor={colors.primary} />
      ) : hasOptions ? (
        <Badge label={t('input.palette.options', { count: command.argOptions!.length })} primaryColor={colors.primary} />
      ) : null}
    </Pressable>
  );
});

// ── Commands mode ─────────────────────────────────────────────────────────────

function CommandsContent({
  commands,
  selectedIndex,
  onHighlight,
  onSelect,
  colors,
}: {
  commands: SlashCommandItem[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (cmd: SlashCommandItem) => void;
  colors: ThemeColors;
}): React.JSX.Element {
  const { t } = useTranslation();
  const rows = useMemo((): PaletteRow[] => {
    const result: PaletteRow[] = [];
    let lastCategory: SlashCommandCategory | null = null;
    let flatIndex = 0;
    for (const command of commands) {
      if (command.category !== lastCategory) {
        result.push({ kind: 'header', category: command.category });
        lastCategory = command.category;
      }
      result.push({ kind: 'command', command, flatIndex });
      flatIndex++;
    }
    return result;
  }, [commands]);

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      bounces={false}
      nestedScrollEnabled
    >
      {rows.map((row, i) => {
        if (row.kind === 'header') {
          return (
            <View key={`header-${i}-${row.category}`} style={styles.categoryRow}>
              <Text style={[styles.categoryLabel, { color: colors.mutedForeground }]}>
                {t(`input.slashCategories.${row.category}`)}
              </Text>
            </View>
          );
        }

        const { command, flatIndex } = row;
        return (
          <CommandRow
            key={command.id}
            command={command}
            flatIndex={flatIndex}
            selected={flatIndex === selectedIndex}
            onHighlight={onHighlight}
            onSelect={onSelect}
            colors={colors}
          />
        );
      })}
    </ScrollView>
  );
}

// ── ArgsOptionRow ─────────────────────────────────────────────────────────────

interface ArgsOptionRowProps {
  option: string;
  index: number;
  commandName: string;
  selected: boolean;
  onHighlight: (index: number) => void;
  onSelect: (option: string) => void;
  colors: ThemeColors;
}

const ArgsOptionRow = React.memo(function ArgsOptionRow({
  option,
  index,
  commandName,
  selected,
  onHighlight,
  onSelect,
  colors,
}: ArgsOptionRowProps): React.JSX.Element {
  return (
    <Pressable
      onPress={() => onSelect(option)}
      onLongPress={() => onHighlight(index)}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? colors.primary + '1F'
            : pressed
              ? colors.secondary
              : 'transparent',
        },
      ]}
    >
      <Terminal size={14} color={colors.primary} style={{ opacity: selected ? 1 : 0.7 }} />
      <Text style={[styles.argsOptionLabel, { color: selected ? colors.foreground : colors.primary }]}>{option}</Text>
      <Text style={[styles.argsOptionFull, { color: colors.mutedForeground }]}>
        /{commandName} {option}
      </Text>
    </Pressable>
  );
});

// ── Args mode ─────────────────────────────────────────────────────────────────

function ArgsContent({
  command,
  options,
  selectedIndex,
  onHighlight,
  onSelect,
  colors,
}: {
  command: SlashCommandItem;
  options: string[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (option: string) => void;
  colors: ThemeColors;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <View style={[styles.subHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.subHeaderCmd, { color: colors.primary }]}>/{command.name}</Text>
        <Text style={[styles.subHeaderDesc, { color: colors.mutedForeground }]}>
          {translatedSlashDescription(t, command)}
        </Text>
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
      >
        {options.map((opt, i) => (
          <ArgsOptionRow
            key={opt}
            option={opt}
            index={i}
            commandName={command.name}
            selected={i === selectedIndex}
            onHighlight={onHighlight}
            onSelect={onSelect}
            colors={colors}
          />
        ))}
      </ScrollView>
    </>
  );
}

// ── ModelRow ──────────────────────────────────────────────────────────────────

interface ModelRowProps {
  item: PickerItem;
  currentIdx: number;
  selected: boolean;
  onHighlight: (index: number) => void;
  onSelect: (item: PickerItem) => void;
  colors: ThemeColors;
}

const ModelRow = React.memo(function ModelRow({
  item,
  currentIdx,
  selected,
  onHighlight,
  onSelect,
  colors,
}: ModelRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const hasMetaLine = Boolean(item.subtitle || item.contextWindow);

  return (
    <Pressable
      onPress={() => onSelect(item)}
      onLongPress={() => onHighlight(currentIdx)}
      style={({ pressed }) => [
        styles.modelRow,
        (hasMetaLine || item.reasoning) ? styles.modelRowTall : undefined,
        {
          backgroundColor: selected
            ? colors.primary + '1F'
            : pressed
              ? colors.secondary
              : 'transparent',
        },
      ]}
    >
      {item.providerSlug ? (
        <ProviderIcon
          slug={item.providerSlug}
          color={item.dot}
          fallbackChar={item.title.charAt(0)}
          size={18}
        />
      ) : (
        <View style={[styles.modelDot, { backgroundColor: item.dot }]}>
          <Text style={styles.modelDotLetter}>{item.title.charAt(0)}</Text>
        </View>
      )}
      <View style={styles.modelTextCol}>
        <Text style={[styles.modelName, { color: colors.foreground }]} numberOfLines={1}>
          {item.title}
        </Text>
        {(hasMetaLine || item.reasoning) ? (
          <View style={styles.modelMeta}>
            {item.subtitle ? (
              <Text style={[styles.modelSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
            {item.subtitle && item.contextWindow ? (
              <Text style={[styles.modelMetaDivider, { color: colors.mutedForeground }]}>·</Text>
            ) : null}
            {item.contextWindow ? (
              <Text style={[styles.modelCtx, { color: colors.mutedForeground }]}>
                {formatCtxWindow(item.contextWindow)}
              </Text>
            ) : null}
            {item.reasoning ? (
              <View style={[styles.modelBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '55' }]}>
                <Text style={[styles.modelBadgeText, { color: colors.primary }]}>{t('input.palette.reasoning')}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

// ── Models mode ───────────────────────────────────────────────────────────────

function ModelsContent({
  command,
  sections,
  selectedIndex,
  onHighlight,
  onSelect,
  colors,
}: {
  command: SlashCommandItem;
  sections: PickerSection[];
  selectedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (item: PickerItem) => void;
  colors: ThemeColors;
}): React.JSX.Element {
  const { t } = useTranslation();
  // counter resets each render to assign stable flat indices to each item.
  let counter = 0;

  return (
    <>
      <View style={[styles.subHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.subHeaderCmd, { color: colors.primary }]}>/{command.name}</Text>
        <Text style={[styles.subHeaderDesc, { color: colors.mutedForeground }]}>
          {translatedSlashDescription(t, command)}
        </Text>
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        bounces={false}
        nestedScrollEnabled
      >
        {sections.map((section, si) => {
          if (section.items.length === 0) return null;
          return (
            <View key={section.title}>
              {(si > 0 || sections.length > 1) ? (
                <View style={styles.categoryRow}>
                  <Text style={[styles.categoryLabel, { color: colors.mutedForeground }]}>
                    {section.title}
                  </Text>
                </View>
              ) : null}
              {section.items.map((item) => {
                const currentIdx = counter++;
                return (
                  <ModelRow
                    key={item.key}
                    item={item}
                    currentIdx={currentIdx}
                    selected={currentIdx === selectedIndex}
                    onHighlight={onHighlight}
                    onSelect={onSelect}
                    colors={colors}
                  />
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SlashCommandPalette({ visible, mode }: SlashCommandPaletteProps): React.JSX.Element {
  const { colors } = useThemeContext();

  const isEmpty =
    mode.kind === 'commands'
      ? mode.commands.length === 0
      : mode.kind === 'args'
        ? mode.options.length === 0
        : mode.sections.every((s) => s.items.length === 0);

  const actuallyVisible = visible && !isEmpty;

  const selectedCommand: SlashCommandItem | null =
    mode.kind === 'commands'
      ? (mode.selectedIndex >= 0 ? (mode.commands[mode.selectedIndex] ?? null) : null)
      : mode.kind === 'args'
        ? mode.command
        : null;

  const selectedOption: string | undefined =
    mode.kind === 'args' && mode.selectedIndex >= 0
      ? mode.options[mode.selectedIndex]
      : undefined;

  const selectedModel: PickerItem | undefined =
    mode.kind === 'models' && mode.selectedIndex >= 0
      ? mode.sections.flatMap((s) => s.items)[mode.selectedIndex]
      : undefined;

  return (
    <View
      style={[styles.anchor, { opacity: actuallyVisible ? 1 : 0 }]}
      pointerEvents={actuallyVisible ? 'auto' : 'none'}
      accessibilityElementsHidden={!actuallyVisible}
      importantForAccessibility={actuallyVisible ? 'auto' : 'no-hide-descendants'}
    >
      <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.secondary }]}>
        {mode.kind === 'commands' ? (
          <CommandsContent
            commands={mode.commands}
            selectedIndex={mode.selectedIndex}
            onHighlight={mode.onHighlight}
            onSelect={mode.onSelect}
            colors={colors}
          />
        ) : mode.kind === 'args' ? (
          <ArgsContent
            command={mode.command}
            options={mode.options}
            selectedIndex={mode.selectedIndex}
            onHighlight={mode.onHighlight}
            onSelect={mode.onSelect}
            colors={colors}
          />
        ) : (
          <ModelsContent
            command={mode.command}
            sections={mode.sections}
            selectedIndex={mode.selectedIndex}
            onHighlight={mode.onHighlight}
            onSelect={mode.onSelect}
            colors={colors}
          />
        )}
        <PaletteDetailFooter
          mode={mode.kind}
          selectedCommand={selectedCommand}
          selectedOption={selectedOption}
          selectedModel={selectedModel}
          borderColor={colors.border}
          textColor={colors.foreground}
          mutedColor={colors.mutedForeground}
        />
      </View>
      </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: '100%',
    marginBottom: Spacing.sm,
    zIndex: 60,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 320,
  },
  list: {
    flex: 0,
  },
  listContent: {
    paddingVertical: 4,
  },
  categoryRow: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 2,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  textCol: {
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  name: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  argHint: {
    fontSize: FontSize.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  desc: {
    flex: 1,
    fontSize: FontSize.xs,
    textAlign: 'right',
  },
  // Sub-palette header (args + models)
  subHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subHeaderCmd: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  subHeaderDesc: {
    fontSize: FontSize.xs,
    fontWeight: '400',
    flexShrink: 1,
  },
  // Args option rows
  argsOptionLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    flex: 1,
  },
  argsOptionFull: {
    fontSize: FontSize.xs,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  // Model rows
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  modelRowTall: {
    alignItems: 'flex-start',
    paddingTop: 10,
    paddingBottom: 10,
  },
  modelDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modelDotLetter: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modelTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  modelName: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  modelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  modelSubtitle: {
    fontSize: 10,
    opacity: 0.7,
    flexShrink: 1,
  },
  modelMetaDivider: {
    fontSize: 10,
    opacity: 0.6,
  },
  modelCtx: {
    fontSize: 10,
    opacity: 0.75,
  },
  modelBadge: {
    borderRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  modelBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
