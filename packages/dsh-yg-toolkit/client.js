window.__ModuleLoader__.load({
  id: '@dsh/yg-toolkit',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    function YGToolkit() {
      const [isActive, setIsActive] = React.useState(true);
      const [time, setTime] = React.useState(new Date());
      const [pos, setPos] = React.useState({ x: 0, y: 0 });
      const [isDragging, setIsDragging] = React.useState(false);
      const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });

      React.useEffect(() => {
        const interval = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(interval);
      }, []);

      // 鼠标拖动处理
      const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
      };
      const handleMouseMove = (e) => {
        if (!isDragging) return;
        setPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
      };
      const handleMouseUp = () => {
        setIsDragging(false);
      };
      React.useEffect(() => {
        if (isDragging) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
          return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
          };
        }
      }, [isDragging, dragOffset, pos]);

      return h('div', {
        style: {
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          padding: '20px',
          background: isActive ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#333',
          borderRadius: '16px',
          color: 'white',
          textAlign: 'center',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          transition: 'background 0.3s ease',
          userSelect: 'none',
          minWidth: '220px',
          cursor: isDragging ? 'grabbing' : 'grab',
          zIndex: 9999,
        },
        onMouseDown: handleMouseDown,
      }, [
        h('h2', { style: { margin: '0 0 8px 0', fontSize: '20px' } }, 'YG Toolkit ❤️'),
        h('div', { style: { fontSize: '12px', opacity: 0.7, marginBottom: '6px' } }, '拖我到任意位置'),
        h('div', { style: { fontSize: '16px', margin: '8px 0' } }, `时间: ${time.toLocaleTimeString()}`),
        h('button', {
          onClick: (e) => { e.stopPropagation(); setIsActive(!isActive); },
          style: {
            padding: '8px 16px',
            backgroundColor: isActive ? '#4CAF50' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            pointerEvents: 'auto',
          }
        }, isActive ? 'Active' : 'Inactive'),
        h('div', { style: { marginTop: '12px', fontSize: '12px', opacity: 0.8 } }, 'YGFan forever ❤️'),
      ]);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'yg-toolkit',
          order: 10
        }, YGToolkit));
      },
    };
  },
});