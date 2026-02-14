import * as React from 'react';

type IconProps = Record<string, unknown>;

function icon(name: string) {
  return function Icon(props: IconProps) {
    return React.createElement('span', { ...props, 'data-icon': name });
  };
}

export const PlusCircleOutlined = icon('PlusCircleOutlined');
export const PlusOutlined = icon('PlusOutlined');
export const QuestionCircleOutlined = icon('QuestionCircleOutlined');
export const DownOutlined = icon('DownOutlined');
export const EllipsisOutlined = icon('EllipsisOutlined');
export const DownloadOutlined = icon('DownloadOutlined');
export const InboxOutlined = icon('InboxOutlined');

