declare module '*.svg' {
  import type { FC } from 'react';
  import type { SvgProps } from 'react-native-svg';

  const component: FC<SvgProps>;
  export default component;
}
