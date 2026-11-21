import React from 'react';
import {
  View,
  Image,
  Pressable,
  Text,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { COLORS } from '../constants';

interface QuickToolsBarProps {
  onOpenSiren: () => void;
  onOpenFakeCall: () => void;
  onOpenHelpline: () => void;
  onShareQuickPin: () => void;
}

export const QuickToolsBar: React.FC<QuickToolsBarProps> = ({
  onOpenSiren,
  onOpenFakeCall,
  onOpenHelpline,
  onShareQuickPin,
}) => {
  const isDark = useColorScheme() === 'dark';

  const tools = [
    {label: 'Siren', icon:require('../assets/tool-siren.png'), hint:'Strobe and vibration', ink:'#85432B', tint:'#F5E5DA', action: onOpenSiren},
    {label: 'Simulate a call', icon:require('../assets/tool-phone.png'), hint:'Incoming call screen', ink:'#3C537B', tint:'#E3EAF6', action: onOpenFakeCall},
    {label: 'Helplines', icon:require('../assets/tool-helpline.png'), hint:'Emergency numbers', ink:'#684C6B', tint:'#F0E6EF', action: onOpenHelpline},
    {label: 'Share location pin', icon:require('../assets/tool-pin.png'), hint:'Send your last GPS pin', ink:'#246357', tint:'#DEEEE8', action: onShareQuickPin},
  ];
  const textColor = isDark ? '#E2F1EC' : COLORS.textPrimary;
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={[styles.title, {color: textColor}]}>Safety tools</Text>
      <View style={styles.grid}>
        {tools.map(tool => (
          <Pressable key={tool.label} accessibilityHint={tool.hint} accessibilityRole="button" onPress={tool.action}
            style={({pressed}) => [styles.tool, {opacity: pressed ? 0.76 : 1, transform:[{scale:pressed ? 0.98 : 1}]}, {backgroundColor: isDark ? '#1A2427' : COLORS.surface, borderColor: isDark ? '#344549' : COLORS.border}]}>
            <View style={styles.iconLine}>
              <View style={[styles.iconTile,{backgroundColor:tool.tint}]}><Image source={tool.icon} style={{width:23,height:23,tintColor:tool.ink}}/></View>
              <Text style={{color:isDark ? '#AEBFB8' : '#64766F'}}>›</Text>
            </View>
            <Text style={[styles.label, {color: textColor}]}>{tool.label}</Text>
            <Text style={{color: isDark ? '#ADBBB7' : COLORS.textSecondary, fontSize:13, lineHeight:18}}>{tool.hint}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {gap: 10},
  title: {fontSize: 17, fontWeight: '600'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  tool: {flexBasis: '47%', flexGrow: 1, gap: 4, minHeight: 105, padding: 12, borderWidth: 1, borderRadius: 10},
  iconLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:5},
  iconTile:{width:36,height:36,borderRadius:12,alignItems:'center',justifyContent:'center'},
  label: { fontSize: 15, fontWeight: '500', paddingRight: 6},
});

export default QuickToolsBar;
