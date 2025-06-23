'use client'
import React from 'react';
import moment from 'moment';

type EventData = {
    id: string;
    date: string;
    heure_debut: string;
    type: string;
    cours: { nom: string };
    enseignants: { nom: string };
    salles: { nom: string };
};

interface TimetableGridProps {
    events: EventData[];
    currentDate: Date;
}

const TIME_SLOTS = [ "08:00", "09:30", "11:00", "13:30", "15:00", "16:30" ];
const TIME_SLOT_LABELS = [ "08:00 - 09:30", "09:30 - 11:00", "11:00 - 12:30", "12:30 - 13:30", "13:30 - 15:00", "15:00 - 16:30", "16:30 - 18:00" ];
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const typeColorMap: { [key: string]: string } = {
    'CM': 'bg-red-100 border-l-4 border-red-500',
    'TD': 'bg-purple-100 border-l-4 border-purple-500',
    'TP': 'bg-blue-100 border-l-4 border-blue-500',
    'Cours': 'bg-yellow-100 border-l-4 border-yellow-500',
};

const TimetableGrid: React.FC<TimetableGridProps> = ({ events, currentDate }) => {
    
    const grid: (EventData[])[][] = Array(DAYS.length).fill(null).map(() => Array(TIME_SLOTS.length).fill(null).map(() => []));
    const weekStart = moment(currentDate).startOf('isoWeek');

    events.forEach(event => {
        const eventDay = moment(event.date).isoWeekday() - 1;
        const eventStartHour = event.heure_debut.substring(0, 5);
        const timeSlotIndex = TIME_SLOTS.indexOf(eventStartHour);

        if (eventDay >= 0 && eventDay < DAYS.length && timeSlotIndex !== -1) {
            grid[eventDay][timeSlotIndex].push(event);
        }
    });

    return (
        <div className="overflow-x-auto shadow-md rounded-lg bg-white">
            <table className="min-w-full border-collapse">
                <thead>
                    <tr className="bg-gray-200">
                        <th className="py-3 px-2 border text-center text-sm font-bold text-gray-600 uppercase">Heure</th>
                        {DAYS.map(day => (
                            <th key={day} className="py-3 px-2 border text-center text-sm font-bold text-gray-600 uppercase w-1/6">
                                {day} <br/>
                                <span className="font-normal text-xs">{weekStart.clone().add(DAYS.indexOf(day), 'days').format('DD/MM')}</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {TIME_SLOT_LABELS.map((slot, timeIndex) => {
                         if (slot.includes('12:30')) {
                            return (
                                <tr key={slot}>
                                    <td className="py-3 px-2 border font-semibold text-center bg-gray-100">{slot}</td>
                                    <td colSpan={DAYS.length} className="py-3 px-2 border text-center bg-gray-50 text-gray-400 font-semibold">PAUSE DÉJEUNER</td>
                                </tr>
                            )
                        }
                        const gridIndex = slot.includes('13:30') ? timeIndex - 1 : timeIndex;

                        return (
                            <tr key={slot}>
                                <td className="py-3 px-2 border font-semibold text-center bg-gray-100">{slot}</td>
                                {DAYS.map((day, dayIndex) => {
                                    const cellEvents = grid[dayIndex] ? grid[dayIndex][gridIndex] : [];
                                    return (
                                        <td key={`${day}-${slot}`} className="py-2 px-1 border align-top h-28">
                                            {cellEvents.length > 0 && (
                                                <div className="space-y-1">
                                                {cellEvents.map(event => (
                                                    <div key={event.id} className={`p-2 rounded-lg text-xs ${typeColorMap[event.type] || 'bg-gray-100'}`}>
                                                        <p className="font-bold text-gray-800">{event.cours.nom}</p>
                                                        <p className="text-gray-700">{event.enseignants.nom}</p>
                                                        <p className="text-gray-600 font-semibold">Salle: {event.salles.nom}</p>
                                                        <p className="text-gray-500 font-bold">[{event.type}]</p>
                                                    </div>
                                                ))}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default TimetableGrid;