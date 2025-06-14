/*'use client'
import { supabase } from '@/src/lib/supabaseClient'

import { useState } from 'react'
import { genererEmploiDuTemps } from '@/src/lib/generation'
import Header from '@/src/components/Header'
import AuthGuard from '@/src/components/AuthGuard'

export default function GenerationPage() {
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    const lancerGeneration = async () => {
        setLoading(true)
        const generated = await genererEmploiDuTemps(setMessage)

        // 🔁 On insère les créneaux dans la base (et on vide avant)
        await supabase.from('emplois_du_temps').delete().neq('id', '')
        const { error } = await supabase.from('emplois_du_temps').insert(generated)

        if (error) {
            setMessage("Erreur lors de l'insertion dans la base.")
        } else {
            setMessage("Génération réussie et insérée en base !")
        }

        setLoading(false)
    }



    return (
        <AuthGuard>
            <div className="p-6 max-w-xl mx-auto text-center">
                <Header />
                <h1 className="text-2xl font-bold mb-4">Génération automatique</h1>
                <button
                    onClick={lancerGeneration}
                    className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700"
                    disabled={loading}
                >
                    {loading ? 'Génération...' : 'Générer automatiquement'}
                </button>
                <p className="mt-4 text-sm text-gray-700">{message}</p>
            </div>
        </AuthGuard>
    )
}
*/