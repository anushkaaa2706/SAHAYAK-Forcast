export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed'
        });
    }

    try {
        const { email, password } = req.body;

        const users = [
            {
                email: 'admin@sahayak.gov.in',
                password: 'admin123',
                name: 'SAHAYAK Admin',
                role: 'super_admin'
            },
            {
                email: 'authority@sahayak.gov.in',
                password: 'authority123',
                name: 'Disaster Authority',
                role: 'disaster_authority'
            },
            {
                email: 'district@sahayak.gov.in',
                password: 'district123',
                name: 'District Officer',
                role: 'district_officer'
            },
            {
                email: 'field@sahayak.gov.in',
                password: 'field123',
                name: 'Field Officer',
                role: 'field_officer'
            },
            {
                email: 'analyst@sahayak.gov.in',
                password: 'analyst123',
                name: 'Risk Analyst',
                role: 'analyst'
            },
            {
                email: 'citizen@sahayak.gov.in',
                password: 'citizen123',
                name: 'Citizen User',
                role: 'citizen'
            }
        ];

        const user = users.find(
            u => u.email === email && u.password === password
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        return res.status(200).json({
            success: true,
            user: {
                email: user.email,
                name: user.name,
                role: user.role
            }
        });

    } catch (error) {
        console.error('Login error:', error);

        return res.status(500).json({
            success: false,
            message: 'Unable to process login.'
        });
    }
}