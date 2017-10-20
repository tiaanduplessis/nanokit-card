import React from 'react'
import PropTypes from 'prop-types'
import { View, StyleSheet } from 'react-native'

const Card = ({ width, height, margin, style, children, ...otherProps }) => (
  <View {...otherProps} style={[styles.card, { width, height, margin }, style]}>
    {children}
  </View>
)

const styles = StyleSheet.create({
  card: {
    borderRadius: 2,
    backgroundColor: '#fff',
    shadowColor: 'rgba(0, 0, 0, 0.4)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.9,
    shadowRadius: 2,
    elevation: 2
  }
})

Card.PropTypes = {
  ...View.propTypes,
  style: PropTypes.object,
  margin: PropTypes.number,
  width: PropTypes.number,
  height: PropTypes.number
}

Card.defaultProps = {
  margin: 10
}

export default Card
