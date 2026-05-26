/* ============================================================================
 * Archivo: TiendaModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de Tienda. Punto de venta destino al que se envían
 *              cajas con prepacks. Incluye enum EstadoTienda para estado_rep.
 * ============================================================================ */
import {Model} from 'sequelize';

interface TiendaAtributos{
    tienda_id:string,
    nombre:string,
    ciudad:string,
    region:string,
    bahia_asignada:string,
    activa:boolean,
    estado_rep:string
}

export enum EstadoTienda{
    ACTIVA = 'ACTIVA',
    PAUSADA = 'PAUSADA',
    CERRADA = 'CERRADA'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class TiendaModel extends Model<TiendaAtributos>
    implements TiendaAtributos{
        tienda_id!: string;
        nombre!: string;
        ciudad!: string;
        region!: string;
        bahia_asignada!: string;
        activa!: boolean;
        estado_rep!: string;
        static associate(models:any){
            //Tienda 1:N Tag (destino de)
            TiendaModel.hasMany(models.Tag,{
                foreignKey:'tienda_id'
            });
            //Tienda 1:N Caja (recibe)
            TiendaModel.hasMany(models.Caja,{
                foreignKey:'tienda_id'
            });
        }
    }
    TiendaModel.init({
        tienda_id:{
            type:DataTypes.STRING,
            allowNull:false,
            primaryKey:true,
            unique:true
        },
        nombre:{
            type:DataTypes.STRING,
            allowNull:false,
            validate:{
                notEmpty:true
            }
        },
        ciudad:{
            type:DataTypes.STRING,
            allowNull:false
        },
        region:DataTypes.STRING,
        bahia_asignada:DataTypes.STRING,
        activa:{
            type:DataTypes.BOOLEAN,
            allowNull:false,
            defaultValue:true
        },
        estado_rep:{
            type:DataTypes.ENUM,
            values:Object.values(EstadoTienda),
            allowNull:false,
            defaultValue:EstadoTienda.ACTIVA
        }
    },{
        sequelize,
        modelName:'Tienda'
    });
    return TiendaModel;
}