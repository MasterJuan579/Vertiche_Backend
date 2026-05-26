/* ============================================================================
 * Archivo: TagModel.ts
 * Generado por: Claude (asistente IA) a partir del ERD Vertiche SortFlow.
 * Descripción: Modelo de Tag. Etiqueta RFID que identifica un prepack.
 *              Entidad central: enlaza Proveedor, Tienda destino, Palet,
 *              Pedido y avanza por las etapas RFID. Incluye enums TipoFlujo
 *              y EstadoPrepack.
 * ============================================================================ */
import {Model} from 'sequelize';

interface TagAtributos{
    epc:string,
    sku:string,
    talla:string,
    color:string,
    cantidad_piezas:number,
    proveedor_id:number,
    tienda_id:string,
    palet_id:string,
    pedido_id:string,
    tipo_flujo:string,
    etapa_actual:string,
    qa_fallido:boolean,
    registrado_en:Date
}

export enum TipoFlujo{
    CROSS_DOCK = 'CROSS_DOCK',
    ALMACENAJE = 'ALMACENAJE',
    DEVOLUCION = 'DEVOLUCION'
}

export enum EstadoPrepack{
    REGISTRADO = 'REGISTRADO',
    EN_QA = 'EN_QA',
    APROBADO = 'APROBADO',
    RECHAZADO = 'RECHAZADO',
    EN_CAJA = 'EN_CAJA',
    ENVIADO = 'ENVIADO'
}

module.exports = (sequelize:any, DataTypes:any)=>{
    class TagModel extends Model<TagAtributos>
    implements TagAtributos{
        epc!: string;
        sku!: string;
        talla!: string;
        color!: string;
        cantidad_piezas!: number;
        proveedor_id!: number;
        tienda_id!: string;
        palet_id!: string;
        pedido_id!: string;
        tipo_flujo!: string;
        etapa_actual!: string;
        qa_fallido!: boolean;
        registrado_en!: Date;
        static associate(models:any){
            //Tag N:1 Proveedor
            TagModel.belongsTo(models.Proveedor,{
                foreignKey:'proveedor_id'
            });
            //Tag N:1 Tienda (destino)
            TagModel.belongsTo(models.Tienda,{
                foreignKey:'tienda_id'
            });
            //Tag N:1 Palet
            TagModel.belongsTo(models.Palet,{
                foreignKey:'palet_id'
            });
            //Tag N:1 Pedido
            TagModel.belongsTo(models.Pedido,{
                foreignKey:'pedido_id'
            });
            //Tag 1:N EventoLectura (genera)
            TagModel.hasMany(models.EventoLectura,{
                foreignKey:'epc'
            });
            //Tag 1:N PrepackCaja (asignado a)
            TagModel.hasMany(models.PrepackCaja,{
                foreignKey:'epc'
            });
            //Tag 1:N Anomalia (reporta)
            TagModel.hasMany(models.Anomalia,{
                foreignKey:'epc'
            });
            //Tag 1:N InspeccionQA (inspeccionado en) - usa tag_epc
            TagModel.hasMany(models.InspeccionQA,{
                foreignKey:'tag_epc'
            });
        }
    }
    TagModel.init({
        epc:{
            type:DataTypes.STRING,
            allowNull:false,
            primaryKey:true,
            unique:true
        },
        sku:{
            type:DataTypes.STRING,
            allowNull:false
        },
        talla:DataTypes.STRING,
        color:DataTypes.STRING,
        cantidad_piezas:{
            type:DataTypes.INTEGER,
            allowNull:false,
            defaultValue:1
        },
        proveedor_id:{
            type:DataTypes.INTEGER,
            allowNull:false,
            references:{
                model:'Proveedor',
                key:'id'
            }
        },
        tienda_id:{
            type:DataTypes.STRING,
            allowNull:false,
            references:{
                model:'Tienda',
                key:'tienda_id'
            }
        },
        palet_id:{
            type:DataTypes.STRING,
            references:{
                model:'Palet',
                key:'palet_id'
            }
        },
        pedido_id:{
            type:DataTypes.STRING,
            references:{
                model:'Pedido',
                key:'pedido_id'
            }
        },
        tipo_flujo:{
            type:DataTypes.ENUM,
            values:Object.values(TipoFlujo),
            allowNull:false,
            defaultValue:TipoFlujo.CROSS_DOCK
        },
        etapa_actual:{
            type:DataTypes.ENUM,
            values:Object.values(EstadoPrepack),
            allowNull:false,
            defaultValue:EstadoPrepack.REGISTRADO
        },
        qa_fallido:{
            type:DataTypes.BOOLEAN,
            allowNull:false,
            defaultValue:false
        },
        registrado_en:{
            type:DataTypes.DATE,
            allowNull:false,
            defaultValue:DataTypes.NOW
        }
    },{
        sequelize,
        modelName:'Tag'
    });
    return TagModel;
}