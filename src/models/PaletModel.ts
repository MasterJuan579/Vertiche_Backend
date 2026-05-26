/* ============================================================================
 * Archivo: PaletModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de Palet. Unidad física de transporte que entra al
 *              CD; agrupa prepacks (Tags) y pertenece a un Pedido y a una
 *              OrdenCompra. Incluye enum EstadoPalet.
 * ============================================================================ */
import {Model} from 'sequelize';

interface PaletAtributos{
    palet_id:string,
    pedido_id:string,
    orden_id:string,
    estado:string,
    total_prepacks:number,
    creado_en:Date,
    timestamp_llegada:Date,
    timestamp_salida:Date,
    tiempo_ciclo_min:number
}

export enum EstadoPalet{
    ESPERANDO = 'ESPERANDO',
    EN_RECEPCION = 'EN_RECEPCION',
    EN_QA = 'EN_QA',
    EN_PACKING = 'EN_PACKING',
    COMPLETADO = 'COMPLETADO',
    CON_ERROR = 'CON_ERROR'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class PaletModel extends Model<PaletAtributos>
    implements PaletAtributos{
        palet_id!: string;
        pedido_id!: string;
        orden_id!: string;
        estado!: string;
        total_prepacks!: number;
        creado_en!: Date;
        timestamp_llegada!: Date;
        timestamp_salida!: Date;
        tiempo_ciclo_min!: number;
        static associate(models:any){
            //Palet N:1 Pedido
            PaletModel.belongsTo(models.Pedido,{
                foreignKey:'pedido_id'
            });
            //Palet N:1 OrdenCompra
            PaletModel.belongsTo(models.OrdenCompra,{
                foreignKey:'orden_id'
            });
            //Palet 1:N PaletEtapaLog (registra)
            PaletModel.hasMany(models.PaletEtapaLog,{
                foreignKey:'palet_id'
            });
            //Palet 1:N Tag (contiene)
            PaletModel.hasMany(models.Tag,{
                foreignKey:'palet_id'
            });
        }
    }
    PaletModel.init({
        palet_id:{
            type:DataTypes.STRING,
            allowNull:false,
            primaryKey:true,
            unique:true
        },
        pedido_id:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'Pedido',
                key:'pedido_id'
            }
        },
        orden_id:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'OrdenCompra',
                key:'orden_id'
            }
        },
        estado:{
            type:DataTypes.ENUM,
            values:Object.values(EstadoPalet),
            allowNull:false,
            defaultValue:EstadoPalet.ESPERANDO
        },
        total_prepacks:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
        },
        creado_en:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        },
        timestamp_llegada:DataTypes.DATE,
        timestamp_salida:DataTypes.DATE,
        tiempo_ciclo_min:DataTypes.INTEGER
    },{
        sequelize,
        modelName:'Palet'
    });
    return PaletModel;
}