import React from 'react';
import Button from './Button';

export default {
  title: 'Button Icons',
  component: Button,
};

const Template = (args) => (
  <Button {...args}>
    <svg
      viewBox="0 0 16 16"
      version="1.1"
      width="16"
      height="16"
      aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M9 12h2l-3 3-3-3h2V7h2v5zm3-8c0-.44-.91-3-4.5-3C5.08 1 3 2.92 3 5 1.02
      5 0 6.52 0 8c0 1.53 1 3 3 3h3V9.7H3C1.38 9.7 1.3 8.28 1.3 8c0-.17.05-1.7
      1.7-1.7h1.3V5c0-1.39 1.56-2.7 3.2-2.7 2.55 0 3.13 1.55 3.2 1.8v1.2H12c.81
      0 2.7.22 2.7 2.2 0 2.09-2.25 2.2-2.7 2.2h-2V11h2c2.08 0 4-1.16 4-3.5C16
      5.06 14.08 4 12 4z" />
    </svg>
  </Button>
)

export const IconOnLeft = Template.bind({});
IconOnLeft.args = {
  label: 'Icon on Left',
  mode: 'primary',
  isIconLeft: true,
};

export const IconOnRight = Template.bind({});
IconOnRight.args = {
  label: 'Icon on Right',
  mode: 'primary',
  isIconRight: true,
};