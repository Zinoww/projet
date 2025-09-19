// Test script to verify teacher availability logic
const moment = require('moment');
require('moment/locale/fr');

// Mock the teacher availability check function
async function checkTeacherAvailability(teacherName, newDate, newHeure) {
    // Simulate database response
    const teacherAvailabilityData = {
        'Professeur Test': {
            disponibilites: {
                'Jeudi': true,
                'Samedi': true
            }
        },
        'Professeur Disponible': {
            disponibilites: null
        }
    };

    const data = teacherAvailabilityData[teacherName];

    if (!data) {
        console.error('Teacher not found:', teacherName);
        return true; // Assume available if teacher not found
    }

    const disponibilites = data.disponibilites;
    const unavailableDays = disponibilites ? Object.keys(disponibilites).filter(day => disponibilites[day]) : [];

    const dayOfWeek = moment(newDate).format('dddd');
    const isAvailable = !unavailableDays.includes(dayOfWeek);

    return isAvailable;
}

// Test cases
async function runTests() {

    // Test 1: Teacher unavailable on Thursday
    await checkTeacherAvailability('Professeur Test', '2024-06-13', '08:00'); // Thursday

    // Test 2: Teacher available on Monday
    await checkTeacherAvailability('Professeur Test', '2024-06-10', '08:00'); // Monday

    // Test 3: Teacher with no availability restrictions
    await checkTeacherAvailability('Professeur Disponible', '2024-06-13', '08:00'); // Thursday

    // Test 4: Teacher unavailable on Saturday
    await checkTeacherAvailability('Professeur Test', '2024-06-15', '08:00'); // Saturday
}

runTests().catch(console.error);
