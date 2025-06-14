'use client'

import Link from 'next/link'
import Header from '@/src/components/Header'

export default function HomePage() {
    return (
        <div className="p-6 max-w-6xl mx-auto">
            <Header />
            <h1 className="text-3xl font-bold mb-6 text-center">
                Bienvenue dans l'outil de planification pédagogique 📅
            </h1>

            {/* Colonne verticale des boutons à gauche */}
            <div className="flex">
                <div className="flex flex-col gap-4 w-64">
                    <Card title="Cours" href="/cours" />
                    <Card title="Salles" href="/salles" />
                    <Card title="Enseignants" href="/enseignants" />
                    <Card title="Emploi du temps" href="/emploi-du-temps" />
                    <Card title="Calendrier" href="/calendrier" />

                </div>
            </div>
        </div>
    )
}

function Card({ title, href }: { title: string; href: string }) {
    return (
        <Link
            href={href}
            className="block bg-white border border-gray-300 text-center p-4 rounded shadow hover:shadow-lg transition"
        >
            <h2 className="text-lg font-semibold">{title}</h2>
        </Link>
    )
}
