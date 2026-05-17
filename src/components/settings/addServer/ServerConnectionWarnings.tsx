import React from 'react';
import { Text, View } from 'react-native';
import { AlertTriangle, Wifi } from 'lucide-react-native';
import Markdown from '@ronradtke/react-native-markdown-display';
import { FontSize } from '@/constants/theme';
import type { ThemeColors } from '@/types';
import { createBannerMarkdownStyles } from '@/utils/markdownTheme';
import { addServerStyles as s } from './addServerStyles';

interface ServerConnectionWarningsProps {
  isTailnet: boolean;
  insecureWarn: boolean;
  colors: ThemeColors;
  t: ReturnType<typeof import('react-i18next').useTranslation>['t'];
}

export function ServerConnectionWarnings({
  isTailnet,
  insecureWarn,
  colors,
  t,
}: ServerConnectionWarningsProps): React.JSX.Element | null {
  if (!isTailnet && !insecureWarn) return null;

  return (
    <>
      {isTailnet ? (
        <View style={[s.warningCard, { backgroundColor: `${colors.warning}20`, borderColor: `${colors.warning}50` }]}>
          <View style={[s.warningIcon, { backgroundColor: `${colors.warning}30` }]}>
            <Wifi size={16} color={colors.warningText} />
          </View>
          <View style={s.flex}>
            <Text style={{ color: colors.warningText, fontSize: FontSize.sm, fontWeight: '600' }}>
              {t('settings.addServer.tailnetTitle')}
            </Text>
            <Markdown style={createBannerMarkdownStyles(colors.warningText, FontSize.xs)}>
              {t('settings.addServer.tailnetBody')}
            </Markdown>
          </View>
        </View>
      ) : null}

      {insecureWarn ? (
        <View style={[s.warningCard, { backgroundColor: `${colors.destructive}14`, borderColor: `${colors.destructive}40` }]}>
          <View style={[s.warningIcon, { backgroundColor: `${colors.destructive}20` }]}>
            <AlertTriangle size={16} color={colors.destructive} />
          </View>
          <View style={s.flex}>
            <Text style={{ color: colors.destructive, fontSize: FontSize.sm, fontWeight: '600' }}>
              {t('settings.addServer.insecureTitle')}
            </Text>
            <Markdown style={createBannerMarkdownStyles(colors.destructive, FontSize.xs)}>
              {t('settings.addServer.insecureBody')}
            </Markdown>
          </View>
        </View>
      ) : null}
    </>
  );
}
