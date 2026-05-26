/* ============================================================================
 * Archivo: OrdenCompraModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de OrdenCompra. Cabecera de orden emitida a un
 *              proveedor; agrupa DetalleOrden (líneas) y Palets cuando
 *              llega la mercancía. Incluye enum EstadoOrden.
 * ============================================================================ */
import {Model} from 'sequelize';

interface OrdenCompraAtributos{
    orden_id:string,
    proveedor_id:number,
    modelo:string,
    nombre_producto:string,
    estado:string,
    total_esperados:number,
    total_recibidos:number,
    fecha_creacion:Date
}

export enum EstadoOrden{
    CREADA = 'CREADA',
    ENVIADA = 'ENVIADA',
    EN_TRANSITO = 'EN_TRANSITO',
    RECIBIDA = 'RECIBIDA',
    PARCIAL = 'PARCIAL',
    CANCELADA = 'CANCELADA'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class OrdenCompraModel extends Model<OrdenCompraAtributos>
    implements OrdenCompraAtributos{
        orden_id!: string;
        proveedor_id!: number;
        modelo!: string;
        nombre_producto!: string;
        estado!: string;
        total_esperados!: number;
        total_recibidos!: number;
        fecha_creacion!: Date;
        static associate(models:any){
            //OrdenCompra N:1 Proveedor
            OrdenCompraModel.belongsTo(models.Proveedor,{
                foreignKey:'proveedor_id'
            });
            //OrdenCompra 1:N DetalleOrden (contiene)
            OrdenCompraModel.hasMany(models.DetalleOrden,{
                foreignKey:'orden_id'
            });
            //OrdenCompra 1:N Palet (agrupa)
            OrdenCompraModel.hasMany(models.Palet,{
                foreignKey:'orden_id'
            });
        }
    }
    OrdenCompraModel.init({
        orden_id:{
            type:DataTypes.STRING,
            allowNull:false,
            primaryKey:true,
            unique:true
        },
        proveedor_id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            references:{
                model:'Proveedor',
                key:'id'
            }
        },
        modelo:DataTypes.STRING,
        nombre_producto:{
            type:DataTypes.STRING,
            allowNull:false
        },
        estado:{
            type:DataTypes.ENUM,
            values:Object.values(EstadoOrden),
            allowNull:false,
            defaultValue:EstadoOrden.CREADA
        },
        total_esperados:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
        },
        total_recibidos:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:0
        },
        fecha_creacion:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        }
    },{
        sequelize,
        modelName:'OrdenCompra'
    });
    return OrdenCompraModel;
}