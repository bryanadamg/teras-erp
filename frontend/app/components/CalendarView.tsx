import { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function CalendarView({ workOrders, items, compact = false }: any) {
  const { t } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const getItemName = (id: string) => items.find((i: any) => i.id === id)?.name || id;

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'COMPLETED': return 'bg-success text-white';
          case 'IN_PROGRESS': return 'bg-warning text-dark';
          case 'CANCELLED': return 'bg-danger text-white';
          default: return 'bg-primary text-white'; // Pending
      }
  };

  // Generate calendar grid
  const days = [];
  for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className={`calendar-day empty bg-light border opacity-25 ${compact ? 'py-1' : ''}`}></div>);
  }

  for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = new Date().toISOString().split('T')[0] === dateStr;
      
      const dayWOs = workOrders.filter((wo: any) => {
          if (!wo.due_date) return false;
          return wo.due_date.startsWith(dateStr);
      });

      days.push(
          <div key={day} className={`calendar-day border p-1 ${isToday ? 'bg-primary bg-opacity-10 border-primary' : 'bg-white'}`} style={{minHeight: compact ? '40px' : '120px'}}>
              <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className={`fw-bold ${compact ? 'extra-small' : 'small'} ${isToday ? 'text-primary' : 'text-muted'}`} style={{fontSize: compact ? '0.6rem' : 'inherit'}}>{day}</span>
                  {!compact && dayWOs.length > 0 && <span className="badge bg-secondary text-white" style={{fontSize: '0.6rem'}}>{dayWOs.length} Due</span>}
              </div>
              
              <div className={`d-flex ${compact ? 'flex-row justify-content-center' : 'flex-column'} gap-1 overflow-hidden`}>
                  {compact ? (
                      // Dots for compact view
                      dayWOs.slice(0, 3).map((wo: any) => (
                          <div key={wo.id} className={`${getStatusColor(wo.status).split(' ')[0]} rounded-circle`} style={{width: '4px', height: '4px'}} title={wo.code}></div>
                      ))
                  ) : (
                      // Full labels for regular view
                      dayWOs.map((wo: any) => (
                          <div key={wo.id} className={`badge ${getStatusColor(wo.status)} text-start fw-normal text-truncate w-100 p-1`} title={`${wo.code}: ${getItemName(wo.item_id)}`}>
                              <div style={{fontSize: '0.65rem', lineHeight: '1.1'}}>{wo.code}</div>
                              <div style={{fontSize: '0.7rem'}}>{getItemName(wo.item_id)}</div>
                          </div>
                      ))
                  )}
                  {compact && dayWOs.length > 3 && <div className="text-muted" style={{fontSize: '0.5rem'}}>+</div>}
              </div>
          </div>
      );
  }

  return (
      <div className={`fade-in ${compact ? 'compact-calendar' : ''}`}>
          <div className="d-flex justify-content-between align-items-center mb-2 no-print">
              <div className="d-flex align-items-center gap-2">
                  <div className="btn-group">
                      <button className="btn btn-xs btn-light border p-1" style={{fontSize: '0.6rem'}} onClick={prevMonth}><i className="bi bi-chevron-left"></i></button>
                      {compact ? null : <button className="btn btn-sm btn-light border" onClick={goToToday}>Today</button>}
                      <button className="btn btn-xs btn-light border p-1" style={{fontSize: '0.6rem'}} onClick={nextMonth}><i className="bi bi-chevron-right"></i></button>
                  </div>
                  <span className={`fw-bold text-primary ${compact ? 'small' : ''}`}>
                      {currentDate.toLocaleDateString(undefined, { month: compact ? 'short' : 'long', year: 'numeric' })}
                  </span>
              </div>
          </div>
          <div className="card border-0 shadow-sm overflow-hidden">
              <div className="card-body p-0">
                  <div className="d-grid text-center bg-light border-bottom" style={{gridTemplateColumns: 'repeat(7, 1fr)'}}>
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                          <div key={d} className="py-1 fw-bold text-muted" style={{fontSize: '0.6rem'}}>{d}</div>
                      ))}
                  </div>
                  <div className="d-grid" style={{gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: '#e5e7eb', gap: '1px'}}>
                      {days}
                  </div>
              </div>
          </div>
      </div>
  );
}