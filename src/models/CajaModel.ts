/* ============================================================================
 * Archivo: CajaModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de Caja. Contenedor de salida asociado a una Tienda
 *              y bahía; agrupa prepacks vía PrepackCaja. Incluye enum
 *              EstadoCaja.
 * ============================================================================ */
import {Model} from 'sequelize';

interface CajaAtributos{
    caja_id:string,
    tienda_id:string,
    bahia:string,
    estado:string,
    timestamp_creacion:Date,
    timestamp_sellado:Date
}

export enum EstadoCaja{
    ABIERTA = 'ABIERTA',
    EN_LLENADO = 'EN_LLENADO',
    SELLADA = 'SELLADA',
    ENVIADA = 'ENVIADA',
    ANULADA = 'ANULADA'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class CajaModel extends Model<CajaAtributos>
    implements CajaAtributos{
        caja_id!: string;
        tienda_id!: string;
        bahia!: string;
        estado!: string;
        timestamp_creacion!: Date;
        timestamp_sellado!: Date;
        static associate(models:any){
            //Caja N:1 Tienda
            CajaModel.belongsTo(models.Tienda,{
                foreignKey:'tienda_id'
            });
            //Caja 1:N PrepackCaja (empaca)
            CajaModel.hasMany(models.PrepackCaja,{
                foreignKey:'caja_id'
            });
        }
    }
    CajaModel.init({
        caja_id:{
            type:DataTypes.STRING,
            allowNull:false,
            primaryKey:true,
            unique:true
        },
        tienda_id:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'Tienda',
                key:'tienda_id'
            }
        },
        bahia:{
            type:DataTypes.STRING,
            allowNull:false
        },
        estado:{
            type:DataTypes.ENUM,
            values:Object.values(EstadoCaja),
            allowNull:false,
            defaultValue:EstadoCaja.ABIERTA
        },
        timestamp_creacion:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        },
        timestamp_sellado:DataTypes.DATE
    },{
        sequelize,
        modelName:'Caja'
    });
    return CajaModel;
}