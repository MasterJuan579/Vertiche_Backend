/* ============================================================================
 * Archivo: UsuarioModel.ts
 * Descripción: Perfil + rol del usuario. `cognito_sub` (UUID de Cognito) es el
 *              enlace estable a AWS Cognito, fuente de verdad para autenticación.
 *              El rol vive aquí, no en Cognito.
 * ============================================================================ */
import { Model } from 'sequelize';

type Rol = 'ADMIN' | 'SUPERVISOR' | 'BAY_OPERATOR' | 'OPS_MANAGER' | 'QA_INSPECTOR';

interface UsuarioAtributos {
    id: number;
    cognito_sub: string;
    email: string;
    nombre: string;
    rol: Rol;
    activo: boolean;
}

module.exports = (sequelize: any, DataTypes: any) => {
    class UsuarioModel extends Model<UsuarioAtributos>
    implements UsuarioAtributos {
        id!: number;
        cognito_sub!: string;
        email!: string;
        nombre!: string;
        rol!: Rol;
        activo!: boolean;
    }
    UsuarioModel.init({
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        cognito_sub: {
            type: DataTypes.STRING(36),
            allowNull: false,
            unique: true
        },
        email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        rol: {
            type: DataTypes.ENUM('ADMIN', 'SUPERVISOR', 'BAY_OPERATOR', 'OPS_MANAGER', 'QA_INSPECTOR'),
            allowNull: false
        },
        activo: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        }
    }, {
        sequelize,
        modelName: 'Usuario'
    });
    return UsuarioModel;
};
