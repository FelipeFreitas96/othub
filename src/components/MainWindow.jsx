import UIWindow from './UIWindow'

export default function MainWindow({
  children,
  className = '',
  contentClassName = '',
  width = 280,
  height = 302,
  centered = true,
  draggable = true,
  ...props
}) {
  return (
    <UIWindow
      {...props}
      draggable={draggable}
      movable={draggable}
      width={width}
      height={height}
      position={centered ? 'relative' : (props.position ?? 'fixed')}
      left={centered ? 0 : (props.left ?? 0)}
      top={centered ? 0 : (props.top ?? 0)}
      className={`rounded border-2 shadow-xl ${className}`}
      contentClassName={contentClassName}
      headerClassName="px-3 py-2"
      titleClassName="text-sm"
    >
      {children}
    </UIWindow>
  )
}

