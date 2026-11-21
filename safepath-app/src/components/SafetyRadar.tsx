import React, {useEffect, useRef} from 'react';
import {AccessibilityInfo, Animated, StyleSheet, View} from 'react-native';

export function SafetyRadar({active}: {active: boolean}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let mounted = true;
    let loop: Animated.CompositeAnimation | undefined;
    const configure = (reduced: boolean) => {
      if (!mounted) return;
      loop?.stop();
      pulse.setValue(0);
      if (active && !reduced) {
        loop = Animated.loop(Animated.timing(pulse, {toValue: 1, duration: 2400, useNativeDriver: true, isInteraction: false}));
        loop.start();
      }
    };
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', configure);
    AccessibilityInfo.isReduceMotionEnabled().then(configure).catch(() => {});
    return () => {mounted = false; sub.remove(); loop?.stop();};
  }, [active, pulse]);
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.dial}>
      {[76, 52, 28].map(size => <View key={size} style={[styles.ring, {width: size, height: size, borderRadius: size / 2}]}/>)}
      <View style={styles.horizontal}/><View style={styles.vertical}/>
      {active && <Animated.View style={[styles.wave, {opacity: pulse.interpolate({inputRange:[0,1],outputRange:[0.65,0]}), transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[0.3,1]})}]}]}/>}
      <View style={styles.dot}/>
    </View>
  );
}
const styles = StyleSheet.create({
  dial:{width:80,height:80,alignItems:'center',justifyContent:'center'},
  ring:{position:'absolute',borderColor:'#52746C',borderWidth:1},
  horizontal:{position:'absolute',width:80,height:1,backgroundColor:'#42675F'},
  vertical:{position:'absolute',height:80,width:1,backgroundColor:'#42675F'},
  wave:{position:'absolute',height:72,width:72,borderRadius:36,borderWidth:2,borderColor:'#ABEDD4'},
  dot:{height:10,width:10,borderRadius:5,backgroundColor:'#BCEDCF',borderWidth:2,borderColor:'#FFF'}
});
