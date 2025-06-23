'use client'
import Link from 'next/link';
import { FaBook, FaChalkboardTeacher, FaDoorOpen, FaUniversity, FaUsers, FaCalendarAlt, FaClock, FaLayerGroup } from 'react-icons/fa';
import { supabase } from '@/src/lib/supabaseClient';
import { useEffect, useState, ReactNode } from 'react';

interface StatCardProps {
    icon: ReactNode;
    label: string;
    value: number;
    color: string;
}

const StatCard = ({ icon, label, value, color }: StatCardProps) => (
    <div className="bg-white p-4 rounded-lg shadow-md flex items-center">
        <div className={`p-3 rounded-full mr-4 ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-600 font-semibold">{label}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
    </div>
);

interface NavCardProps {
    href: string;
    icon: ReactNode;
    title: string;
    description: string;
}

const NavCard = ({ href, icon, title, description }: NavCardProps) => (
  <Link href={href}>
    <div className="bg-white rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out p-6 flex flex-col items-center text-center h-full">
      <div className="text-4xl text-indigo-500 mb-4">{icon}</div>
      <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 flex-grow">{description}</p>
    </div>
  </Link>
);


export default function HomePage() {
  const [stats, setStats] = useState({
    filieres: 0,
    enseignants: 0,
    salles: 0,
    cours: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const { count: filieres } = await supabase.from('filieres').select('*', { count: 'exact', head: true });
      const { count: enseignants } = await supabase.from('enseignants').select('*', { count: 'exact', head: true });
      const { count: salles } = await supabase.from('salles').select('*', { count: 'exact', head: true });
      const { count: cours } = await supabase.from('cours').select('*', { count: 'exact', head: true });
      setStats({
        filieres: filieres || 0,
        enseignants: enseignants || 0,
        salles: salles || 0,
        cours: cours || 0,
      });
    };
    fetchStats();
  }, []);

  const managementLinks = [
    { href: '/filieres', icon: <FaUniversity />, title: 'Gestion des Filières', description: 'Créez et organisez les filières académiques.' },
    { href: '/sections', icon: <FaLayerGroup />, title: 'Gestion des Sections', description: 'Gérez les sections au sein de chaque filière.' },
    { href: '/groupes', icon: <FaUsers />, title: 'Gestion des Groupes', description: 'Définissez les groupes d\'étudiants pour les cours.' },
    { href: '/enseignants', icon: <FaChalkboardTeacher />, title: 'Gestion des Enseignants', description: 'Ajoutez et mettez à jour les profils des enseignants.' },
    { href: '/cours', icon: <FaBook />, title: 'Gestion des Cours', description: 'Administrez le catalogue des matières et cours.' },
    { href: '/salles', icon: <FaDoorOpen />, title: 'Gestion des Salles', description: 'Gérez les salles de cours et leurs capacités.' },
  ];
  
  const toolLinks = [
      { href: '/emploi-du-temps', icon: <FaClock />, title: 'Emploi du temps', description: 'Générez, visualisez et modifiez l\'emploi du temps.' },
      { href: '/calendrier', icon: <FaCalendarAlt />, title: 'Calendrier', description: 'Consultez une vue d\'ensemble du planning.' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="container mx-auto px-6 py-10">
        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800">
            Outil de Planification Pédagogique
          </h1>
          <p className="text-lg text-gray-600 mt-4">
            Bienvenue sur votre tableau de bord centralisé.
          </p>
        </header>

        {/* Section des statistiques */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <StatCard icon={<FaUniversity size={24} className="text-white"/>} label="Filières" value={stats.filieres} color="bg-blue-500" />
            <StatCard icon={<FaChalkboardTeacher size={24} className="text-white"/>} label="Enseignants" value={stats.enseignants} color="bg-green-500" />
            <StatCard icon={<FaDoorOpen size={24} className="text-white"/>} label="Salles" value={stats.salles} color="bg-yellow-500" />
            <StatCard icon={<FaBook size={24} className="text-white"/>} label="Cours" value={stats.cours} color="bg-red-500" />
        </section>


        {/* Section de Gestion */}
        <section className="mb-12">
          <h2 className="text-3xl font-bold text-gray-700 mb-6">Gestion des Données</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {managementLinks.map(link => (
              <NavCard key={link.href} {...link} />
            ))}
          </div>
        </section>

        {/* Section des Outils */}
        <section>
          <h2 className="text-3xl font-bold text-gray-700 mb-6">Outils de Planification</h2>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
             {toolLinks.map(link => (
              <NavCard key={link.href} {...link} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
