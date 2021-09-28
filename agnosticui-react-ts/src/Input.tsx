import { FC, ReactNode, HTMLAttributes } from 'react';
import styles from './input.module.css';

export interface InputProps extends HTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  uniqueId: string;
  label: string;
  size?: 'small' | 'large';
  labelCss?: string;
  placeholder?: string;
  helpText?: string;
  invalidText?: string;
  addOnLeft?: ReactNode;
  addOnRight?: ReactNode;
  hasLeftAddon?: boolean;
  hasRightAddon?: boolean;
  inputCss?: string;
  isInvalid?: boolean;
  isRounded?: boolean;
  isDisabled?: boolean;
  isInline?: boolean;
  isSkinned?: boolean;
  isUnderlined?: boolean;
  isUnderlinedWithBackground?: boolean;
  defaultValue?: string;
  type?: 'text' | 'password' | 'email' | 'number' | 'url' | 'tel' | 'search' | 'textarea';
}

export const Input: FC<InputProps> = ({
  uniqueId,
  label,
  size = '',
  labelCss = '',
  placeholder = '',
  helpText = '',
  invalidText = '',
  addOnLeft = '',
  addOnRight = '',
  hasLeftAddon = false,
  hasRightAddon = false,
  inputCss = '',
  isInvalid = false,
  isRounded = false,
  isDisabled = false,
  isInline = false,
  isSkinned = true,
  isUnderlined = false,
  isUnderlinedWithBackground = false,
  defaultValue = '',
  type = 'text',
  onChange,
  onFocus,
  onBlur,
  ...rest
}) => {
  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  const inputClasses = [
    isSkinned ? styles.input : styles.inputBase,
    isRounded ? styles.rounded : '',
    isUnderlined ? styles.underlined : '',
    isDisabled ? styles.disabled : '',
    isInline ? styles.inputInline : '',
    hasLeftAddon ? styles.inputHasLeftAddon : '',
    hasRightAddon ? styles.inputHasRightAddon : '',
    isInvalid ? styles.invalid : '',
    isUnderlinedWithBackground ? styles.underlinedWithBackground : '',
    inputCss ? `${inputCss}` : '',
    size ? styles[`input${capitalize(size)}`] : '',
  ];
  const inputClassesJoined = inputClasses
    .filter((klass) => (klass ? klass.length : null))
    .join(' ');

  const labelClasses = [
    styles.label,
    isInvalid ? styles.labelError : '',
    isInline ? styles.labelInline : '',
    size ? styles[`label${capitalize(size)}`] : '',
    labelCss,
  ];
  const labelClassesJoined = labelClasses.filter((klass) => klass.length).join(' ');

  const invalidClasses = size ? styles[`fieldError${capitalize(size)}`] : styles.fieldError;
  const helpClasses = size ? styles[`fieldHelp${capitalize(size)}`] : styles.fieldHelp;
  const addonContainerClasses = styles.inputAddonContainer;

  const renderInput = () => (
    <input
      id={uniqueId}
      name={uniqueId}
      defaultValue={defaultValue}
      type={type}
      disabled={isDisabled}
      className={inputClassesJoined}
      placeholder={placeholder}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      {...rest}
    />
  );

  const renderAddonsOrInputs = () => (hasLeftAddon || hasRightAddon ? (
    <div className={addonContainerClasses}>
      {addOnLeft && <div className={styles.leftAddon}>{addOnLeft}</div>}
      {renderInput()}
      {addOnRight && <div className={styles.rightAddon}>{addOnRight}</div>}
    </div>
  ) : (
    renderInput()
  ));

  return (
    <div className="width-full">
      <label className={labelClassesJoined} htmlFor={uniqueId}>
        {label}
      </label>
      {type === 'textarea' ? (
        <textarea
          id={uniqueId}
          name={uniqueId}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className={inputClassesJoined}
          disabled={isDisabled}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          {...rest}
        />
      ) : (
        renderAddonsOrInputs()
      )}
      {isInvalid && (
        <span role="status" aria-live="polite" className={invalidClasses}>
          {invalidText}
        </span>
      )}
      {helpText && <span className={helpClasses}>{helpText}</span>}
    </div>
  );
};
