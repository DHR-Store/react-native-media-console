import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexDirection: 'row',
    height: 12, // Increased slightly to accommodate touch area and text alignment
    marginLeft: 20,
    marginRight: 45, // Increased to make room for the percentage text
    width: 150,
  },
  track: {
    backgroundColor: '#333',
    height: 3, // Made slightly thicker (3px instead of 1px) for better visibility
    marginLeft: 7,
  },
  fill: {
    backgroundColor: '#FFF',
    height: 3,
  },
  fillBoosted: {
    backgroundColor: '#FF8800', // VLC Orange
  },
  handle: {
    position: 'absolute',
    marginTop: -24,
    marginLeft: -24,
    padding: 16,
    zIndex: 1,
  },
  icon: {
    marginLeft: 7,
    width: 20, // Explicit sizing to ensure tintColor works smoothly
    height: 20,
    resizeMode: 'contain',
  },
  iconBoosted: {
    tintColor: '#FF8800', // Tints your volume.png orange
  },
  percentageText: {
    position: 'absolute',
    right: -45, // Pins the text to the right side of the slider
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  textBoosted: {
    color: '#FF8800', // VLC Orange
  }
});